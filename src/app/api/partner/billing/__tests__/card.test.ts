import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({ partner: { update: vi.fn() }, partnerInvoice: { findMany: vi.fn(), update: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const finix = vi.hoisted(() => ({ createBuyerIdentity: vi.fn(), createPaymentInstrument: vi.fn() }));
vi.mock("@/lib/finix/client", () => ({ finixClient: finix }));
vi.mock("@/lib/audit", () => ({ createAuditLog: vi.fn().mockResolvedValue(undefined) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "1.2.3.4", "user-agent": "test" }) }));
const requirePartnerSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/partners/partnerSession", () => ({ requirePartnerSession }));

import { POST } from "../card/route";
import { UnauthorizedError } from "@/lib/auth/errors";

const post = (body: unknown) => POST(new Request("https://wgc.test/api/partner/billing/card", { method: "POST", body: JSON.stringify(body) }));
const goodBody = { financeInstrumentToken: "TKN_1", authorizationAccepted: true };

beforeEach(() => {
  vi.clearAllMocks();
  requirePartnerSession.mockResolvedValue({ partnerId: "p1", partnerUserId: "u1", email: "d@example.test" });
  finix.createBuyerIdentity.mockResolvedValue({ id: "ID_1" });
  finix.createPaymentInstrument.mockResolvedValue({ id: "PI_1", brand: "VISA", last_four: "4242", expiration_month: 12, expiration_year: 2030 });
  prismaMock.partner.update.mockResolvedValue({});
  prismaMock.partnerInvoice.findMany.mockResolvedValue([]);
});

describe("POST /api/partner/billing/card", () => {
  it("needs a partner sign-in", async () => {
    requirePartnerSession.mockRejectedValue(new UnauthorizedError());
    expect((await post(goodBody)).status).toBe(401);
    expect(finix.createBuyerIdentity).not.toHaveBeenCalled();
  });

  it("needs the card token and the authorization", async () => {
    expect((await post({ authorizationAccepted: true })).status).toBe(400);
    expect((await post({ financeInstrumentToken: "T" })).status).toBe(400);
    expect((await post({ financeInstrumentToken: "T", authorizationAccepted: "yes" })).status).toBe(400);
    expect(finix.createBuyerIdentity).not.toHaveBeenCalled();
  });

  it("only accepts a card", async () => {
    finix.createPaymentInstrument.mockResolvedValue({ id: "PI_2", bank_account_type: "CHECKING", last_four: "1111" });
    expect((await post(goodBody)).status).toBe(400);
    expect(prismaMock.partner.update).not.toHaveBeenCalled();
  });

  it("saves the instrument on the signed-in partner, keeping only display details", async () => {
    const res = await post(goodBody);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ card: { brand: "VISA", last4: "4242", expMonth: 12, expYear: 2030 } });

    const call = prismaMock.partner.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: "p1" });
    expect(call.data).toMatchObject({ billingIdentityId: "ID_1", billingPaymentInstrumentId: "PI_1", cardBrand: "VISA", cardLast4: "4242", billingAuthTermsVersion: "partner-billing-authorization-v1" });
    expect(JSON.stringify(call.data)).not.toContain("TKN_1");
    expect(finix.createPaymentInstrument).toHaveBeenCalledWith({ identity: "ID_1", token: "TKN_1", type: "TOKEN" });
  });

  it("lets unpaid invoices try again, without ever resetting the attempt number", async () => {
    prismaMock.partnerInvoice.findMany.mockResolvedValue([
      { id: "a", status: "FAILED", attemptCount: 4, attemptBudget: 4 },
      { id: "b", status: "AWAITING_CARD", attemptCount: 0, attemptBudget: 4 },
    ]);
    await post(goodBody);
    expect(prismaMock.partnerInvoice.findMany.mock.calls[0][0].where).toEqual({ partnerId: "p1", status: { in: ["FAILED", "AWAITING_CARD"] } });
    const [a, b] = prismaMock.partnerInvoice.update.mock.calls.map((c) => c[0].data);
    expect(a).toMatchObject({ status: "FAILED", attemptBudget: 6 });
    expect(a.attemptCount).toBeUndefined();
    expect(a.nextAttemptAt).toBeInstanceOf(Date);
    expect(b).toMatchObject({ status: "PENDING", attemptBudget: 4 });
  });

  it("saves nothing and charges nothing when Finix fails", async () => {
    finix.createPaymentInstrument.mockRejectedValue(new Error("finix down"));
    expect((await post(goodBody)).status).toBe(502);
    expect(prismaMock.partner.update).not.toHaveBeenCalled();
  });
});
