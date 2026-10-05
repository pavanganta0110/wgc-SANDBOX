import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Covers the UPDATE_REQUESTED requirement-parsing fix: Finix's
 * MERCHANT.UPDATED webhook body never carries the specific reason itself
 * (confirmed against a real production payload for Lighthouse Baptist
 * Church, 2026-09-04) — it only gives a `verification` ID pointing at a
 * separate Verification resource whose `outcomes` array is the actual
 * source of truth. These tests prove the webhook handler now fetches that
 * resource and parses it, falls back safely when the fetch fails, and
 * always stores a redacted raw payload regardless of which path was taken.
 */

const mockGetVerification = vi.fn();
vi.mock("@/lib/finix/client", () => ({ finixClient: { getVerification: (...a: unknown[]) => mockGetVerification(...a) } }));

// next/headers' headers() requires a real Next.js request-scope context that
// doesn't exist when calling the route handler directly in a unit test —
// mocked to read off the last Request built by postReq() below instead.
let lastReqHeaders: Headers = new Headers();
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => lastReqHeaders),
}));

vi.mock("@/lib/billing/wgcSubscriptionWebhook", () => ({ handleWgcSubscriptionWebhookEvent: vi.fn().mockResolvedValue(false) }));

const mockSendWgcEmail = vi.fn().mockResolvedValue({ success: true, data: {} });
const mockSendWgcAdminEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/email", () => ({
  sendWgcEmail: (...a: unknown[]) => mockSendWgcEmail(...a),
  sendWgcAdminEmail: (...a: unknown[]) => mockSendWgcAdminEmail(...a),
}));

const APP_ROW = {
  id: "app-1",
  contactEmail: "contact@example.com",
  organizationName: "",
  legalBusinessName: "Lighthouse Baptist Church",
  onboardingStatus: "UNDER_REVIEW",
  finixMerchantId: "MU123",
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
    findFirst: vi.fn().mockResolvedValue(APP_ROW),
    update: vi.fn().mockResolvedValue({}),
  },
  church: { findFirst: vi.fn().mockResolvedValue(null) },
  emailLog: {
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: "email-log-1" }),
    update: vi.fn().mockResolvedValue({}),
  },
  $transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
    fn({
      $queryRaw: vi.fn().mockResolvedValue([{ locked: true }]),
      emailLog: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "email-log-1" }),
      },
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
  return new Request("http://x/api/webhooks/finix", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
}

function merchantUpdatedPayload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: `evt-${Math.random()}`,
    entity: "MERCHANT",
    type: "updated",
    created_at: new Date().toISOString(),
    data: {
      id: "MU123",
      merchant: "MU123",
      onboarding_state: "UPDATE_REQUESTED",
      verification: "VIrw87j7jgcPqAwJJfgtgWAX",
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
});

describe("MERCHANT.UPDATED / UPDATE_REQUESTED — resolves the real requirement from the Verification resource", () => {
  it("parses outcomes[].outcome_code into a specific, human-readable requested-items list", async () => {
    mockGetVerification.mockResolvedValue({
      state: "FAILED",
      outcomes: [
        { outcome_code: "BANK_STATEMENT_ONE_MONTH_REQUESTED" },
        { outcome_code: "INVALID_BUSINESS_TAX_ID", remediation_details: { field_name: "entity.business_tax_id" } },
      ],
    });
    const { POST } = await load();
    const res = await POST(postReq(merchantUpdatedPayload()));
    expect(res.status).toBe(200);

    expect(mockGetVerification).toHaveBeenCalledWith("VIrw87j7jgcPqAwJJfgtgWAX");
    const updateCall = mockPrisma.onboardingApplication.update.mock.calls[0][0];
    expect(updateCall.data.updateRequestedItems).toContain("Bank statement one month requested");
    expect(updateCall.data.updateRequestedItems).toContain("Invalid business tax id (entity.business_tax_id)");
    // Never the generic fallback once a real reason was resolved.
    expect(updateCall.data.updateRequestedItems).not.toContain("Additional documentation is required to verify your business and identity.");
  });

  it("falls back to the generic message (and still 200s) when the Verification fetch fails, without throwing", async () => {
    mockGetVerification.mockRejectedValue(new Error("Finix Error: 404 not found"));
    const { POST } = await load();
    const res = await POST(postReq(merchantUpdatedPayload()));
    expect(res.status).toBe(200);

    const updateCall = mockPrisma.onboardingApplication.update.mock.calls[0][0];
    expect(updateCall.data.updateRequestedItems).toBeUndefined();
    expect(mockSendWgcEmail).toHaveBeenCalledWith(
      expect.objectContaining({ bodyHtml: expect.stringContaining("Additional documentation is required to verify your business and identity.") })
    );
  });

  it("always stores a redacted raw payload in updateRequestedCodes — the fetched Verification when available, so the ground truth is recoverable even if outcome_code parsing misses a shape", async () => {
    mockGetVerification.mockResolvedValue({ state: "FAILED", outcomes: [] });
    const { POST } = await load();
    await POST(postReq(merchantUpdatedPayload()));

    const updateCall = mockPrisma.onboardingApplication.update.mock.calls[0][0];
    expect(updateCall.data.updateRequestedCodes).toEqual({ state: "FAILED", outcomes: [] });
    // Generic fallback message still used since outcomes was empty.
    expect(updateCall.data.updateRequestedItems).toBeUndefined();
  });

  it("never calls the Verification API when the Merchant payload has no verification id", async () => {
    const { POST } = await load();
    await POST(postReq(merchantUpdatedPayload({ verification: undefined })));
    expect(mockGetVerification).not.toHaveBeenCalled();
    const updateCall = mockPrisma.onboardingApplication.update.mock.calls[0][0];
    expect(updateCall.data.updateRequestedCodes).toEqual(expect.objectContaining({ id: "MU123" }));
  });
});
