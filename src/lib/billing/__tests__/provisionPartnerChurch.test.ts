import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({ church: { update: vi.fn() }, onboardingApplication: { findUnique: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const provisionChurchAccount = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/provisionChurchAccount", () => ({ provisionChurchAccount }));
const attachChurchToPartner = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/lib/partners/partnerBilling", () => ({ attachChurchToPartner }));
const partnerSuppressesMerchantEmails = vi.hoisted(() => vi.fn());
vi.mock("@/lib/partners/onboardingCode", () => ({ partnerSuppressesMerchantEmails }));
vi.mock("@/lib/email", () => ({ sendWgcAdminEmail: vi.fn() }));
const createBillingActivationToken = vi.hoisted(() => vi.fn().mockResolvedValue("tok"));
vi.mock("@/lib/billing/billingActivation", () => ({ createBillingActivationToken }));
const sendSubscriptionActivationEmail = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/lib/billing/billingEmails", () => ({ sendSubscriptionActivationEmail }));
vi.mock("@/lib/billing/promotionEntitlement", () => ({ attachPromotionEntitlementIfLeadExists: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/billing/billingAudit", () => ({ logBillingAuditEvent: vi.fn().mockResolvedValue(undefined) }));

import { provisionChurchAndBillingGate } from "../provisionChurchAndBillingGate";

const app = {
  id: "app1",
  organizationName: "Grace",
  legalBusinessName: null,
  contactEmail: "pastor@example.test",
  contactName: "Pastor",
  finixMerchantId: "MU1",
  finixIdentityId: "ID1",
  finixApplicationId: "AP1",
};

beforeEach(() => {
  vi.clearAllMocks();
  provisionChurchAccount.mockResolvedValue({ church: { id: "c1" }, user: { id: "u1" }, emailSent: false });
  partnerSuppressesMerchantEmails.mockResolvedValue(false);
  prismaMock.church.update.mockResolvedValue({});
  prismaMock.onboardingApplication.findUnique.mockResolvedValue({ framePasscodeHash: null });
});

describe("provisionChurchAndBillingGate", () => {
  it("gives an organization with no partner the usual billing gate and activation email", async () => {
    await provisionChurchAndBillingGate(app);
    expect(prismaMock.church.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { billingSetupStatus: "APPROVED_BILLING_REQUIRED" } });
    expect(sendSubscriptionActivationEmail).toHaveBeenCalled();
    expect(attachChurchToPartner).not.toHaveBeenCalled();
  });

  it("gives a partner's organization no subscription gate and no activation email, and links it to the partner", async () => {
    await provisionChurchAndBillingGate({ ...app, partnerId: "p1", partnerReference: "loc_1" });
    expect(prismaMock.church.update).not.toHaveBeenCalled(); // billingSetupStatus stays empty: never gated
    expect(createBillingActivationToken).not.toHaveBeenCalled();
    expect(sendSubscriptionActivationEmail).not.toHaveBeenCalled();
    expect(attachChurchToPartner).toHaveBeenCalledWith({ churchId: "c1", partnerId: "p1", partnerReference: "loc_1", onboardingApplicationId: "app1" });
  });

  it("holds back the dashboard-access email only when the partner asked for it", async () => {
    await provisionChurchAndBillingGate({ ...app, partnerId: "p1", partnerReference: null });
    expect(provisionChurchAccount.mock.calls[0][1]).toMatchObject({ skipAccessEmail: false });

    partnerSuppressesMerchantEmails.mockResolvedValue(true);
    await provisionChurchAndBillingGate({ ...app, partnerId: "p1", partnerReference: null });
    expect(provisionChurchAccount.mock.calls[1][1]).toMatchObject({ skipAccessEmail: true });
  });

  it("passes the owner's frame passcode, chosen on the application, to the owner's account (partner applications only)", async () => {
    prismaMock.onboardingApplication.findUnique.mockResolvedValue({ framePasscodeHash: "salt:hash" });
    await provisionChurchAndBillingGate({ ...app, partnerId: "p1", partnerReference: "loc_1" });
    expect(provisionChurchAccount.mock.calls[0][1]).toMatchObject({ framePasscodeHash: "salt:hash" });

    provisionChurchAccount.mockClear();
    await provisionChurchAndBillingGate({ ...app });
    expect(provisionChurchAccount.mock.calls[0][1].framePasscodeHash).toBeNull();
  });
});

