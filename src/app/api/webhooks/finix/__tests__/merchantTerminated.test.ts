import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Covers the 2026-09-23 finding: Finix reports a terminated merchant's
 * onboarding_state as still "APPROVED" in the very same payload
 * (termination is tracked separately via is_terminated/termination_details).
 * Before this fix, the webhook handler only checked onboarding_state,
 * so a churn event was misread as a fresh approval and re-sent the
 * merchant a "set up your dashboard access" invite for an account that
 * was being closed (confirmed for Springfield Area Collegiate Ministry).
 */

let lastReqHeaders: Headers = new Headers();
vi.mock("next/headers", () => ({ headers: vi.fn(async () => lastReqHeaders) }));

vi.mock("@/lib/billing/wgcSubscriptionWebhook", () => ({ handleWgcSubscriptionWebhookEvent: vi.fn().mockResolvedValue(false) }));

const mockSendWgcEmail = vi.fn().mockResolvedValue({ success: true, data: {} });
const mockSendWgcAdminEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/email", () => ({
  sendWgcEmail: (...a: unknown[]) => mockSendWgcEmail(...a),
  sendWgcAdminEmail: (...a: unknown[]) => mockSendWgcAdminEmail(...a),
}));

const mockProvisionChurch = vi.fn().mockResolvedValue({ church: { id: "church-1" } });
vi.mock("@/lib/billing/provisionChurchAndBillingGate", () => ({ provisionChurchAndBillingGateOrAlert: (...a: unknown[]) => mockProvisionChurch(...a) }));

const APP_ROW = {
  id: "app-1",
  contactEmail: "chris@springfieldbsu.org",
  organizationName: "Springfield Area Collegiate Ministry",
  legalBusinessName: "Springfield Area Collegiate Ministry",
  onboardingStatus: "APPROVED",
  finixMerchantId: "MUcCi9yiqBfvcJyBXqEsFafY",
  finixIdentityId: "ID123",
  finixApplicationId: "AP123",
};

const mockPrisma = {
  finixWebhookEvent: {
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: "webhook-event-1" }),
    update: vi.fn().mockResolvedValue({}),
  },
  finixRawEventArchive: { upsert: vi.fn().mockResolvedValue({}) },
  onboardingApplication: {
    findFirst: vi.fn().mockResolvedValue({ ...APP_ROW }),
    update: vi.fn().mockResolvedValue({}),
  },
  church: {
    findFirst: vi.fn().mockResolvedValue({ id: "church-1", status: "ACTIVE" }),
    update: vi.fn().mockResolvedValue({}),
  },
  emailLog: {
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: "email-log-1" }),
    update: vi.fn().mockResolvedValue({}),
  },
  $transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
    fn({
      $queryRaw: vi.fn().mockResolvedValue([{ locked: true }]),
      emailLog: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: "email-log-1" }) },
    })
  ),
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

async function load() {
  vi.resetModules();
  return import("../route");
}

function postReq(payload: unknown) {
  const auth = Buffer.from("testuser:testpass").toString("base64");
  const headers = new Headers({ authorization: `Basic ${auth}` });
  lastReqHeaders = headers;
  return new Request("http://x/api/webhooks/finix", { method: "POST", headers, body: JSON.stringify(payload) });
}

function terminatedMerchantPayload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: `evt-${Math.random()}`,
    entity: "MERCHANT",
    type: "updated",
    created_at: new Date().toISOString(),
    data: {
      id: "MUcCi9yiqBfvcJyBXqEsFafY",
      merchant: "MUcCi9yiqBfvcJyBXqEsFafY",
      onboarding_state: "APPROVED",
      is_terminated: true,
      processing_enabled: false,
      settlement_enabled: false,
      termination_details: {
        reason: "CHURNED",
        description: "Account owner requested as they will be staying with stripe for the time being. ",
        terminated_at: "2026-09-23T15:19:13.26Z",
        terminated_by: "PARTNER_USER",
      },
      ...overrides,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.FINIX_WEBHOOK_BASIC_USERNAME = "testuser";
  process.env.FINIX_WEBHOOK_BASIC_PASSWORD = "testpass";
  delete process.env.FINIX_WEBHOOK_SECRET;
  delete process.env.FINIX_WEBHOOK_SIGNING_KEY;
  delete process.env.FINIX_WEBHOOK_BEARER_TOKEN;
  mockPrisma.finixWebhookEvent.findUnique.mockResolvedValue(null);
  mockPrisma.finixWebhookEvent.create.mockResolvedValue({ id: "webhook-event-1" });
  mockPrisma.onboardingApplication.findFirst.mockResolvedValue({ ...APP_ROW });
  mockPrisma.church.findFirst.mockResolvedValue({ id: "church-1", status: "ACTIVE" });
});

describe("MERCHANT.UPDATED — is_terminated takes priority over onboarding_state APPROVED", () => {
  it("marks the application TERMINATED instead of APPROVED even though onboarding_state says APPROVED", async () => {
    const { POST } = await load();
    const res = await POST(postReq(terminatedMerchantPayload()));
    expect(res.status).toBe(200);

    const updateCall = mockPrisma.onboardingApplication.update.mock.calls[0][0];
    expect(updateCall.data.onboardingStatus).toBe("TERMINATED");
  });

  it("marks the Church row TERMINATED with the reason and date from termination_details", async () => {
    const { POST } = await load();
    await POST(postReq(terminatedMerchantPayload()));

    expect(mockPrisma.church.update).toHaveBeenCalledWith({
      where: { id: "church-1" },
      data: {
        status: "TERMINATED",
        terminatedAt: new Date("2026-09-23T15:19:13.26Z"),
        terminationReason: "Account owner requested as they will be staying with stripe for the time being. ",
      },
    });
  });

  it("never sends the merchant-facing approval/dashboard-access email or provisions a dashboard account", async () => {
    const { POST } = await load();
    await POST(postReq(terminatedMerchantPayload()));

    expect(mockSendWgcEmail).not.toHaveBeenCalled();
    expect(mockProvisionChurch).not.toHaveBeenCalled();
  });

  it("sends exactly one internal WGC admin alert with the termination reason", async () => {
    const { POST } = await load();
    await POST(postReq(terminatedMerchantPayload()));

    expect(mockSendWgcAdminEmail).toHaveBeenCalledTimes(1);
    expect(mockSendWgcAdminEmail).toHaveBeenCalledWith(
      expect.objectContaining({ newStatus: "TERMINATED", whatHappened: expect.stringContaining("staying with stripe") })
    );
  });

  it("does not re-send the admin alert or re-update the Church row on a later redelivery once already TERMINATED", async () => {
    mockPrisma.onboardingApplication.findFirst.mockResolvedValue({ ...APP_ROW, onboardingStatus: "TERMINATED" });
    mockPrisma.church.findFirst.mockResolvedValue({ id: "church-1", status: "TERMINATED" });

    const { POST } = await load();
    await POST(postReq(terminatedMerchantPayload()));

    expect(mockSendWgcAdminEmail).not.toHaveBeenCalled();
    expect(mockPrisma.church.update).not.toHaveBeenCalled();
  });

  it("does not touch the Church row when no Church has been provisioned yet for this application", async () => {
    mockPrisma.church.findFirst.mockResolvedValue(null);
    const { POST } = await load();
    await POST(postReq(terminatedMerchantPayload()));

    expect(mockPrisma.church.update).not.toHaveBeenCalled();
    // The application-level status still transitions and admins are still alerted.
    expect(mockPrisma.onboardingApplication.update.mock.calls[0][0].data.onboardingStatus).toBe("TERMINATED");
    expect(mockSendWgcAdminEmail).toHaveBeenCalledTimes(1);
  });
});
