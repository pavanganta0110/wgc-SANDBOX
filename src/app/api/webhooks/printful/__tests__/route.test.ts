import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/integrations/printful/config", () => ({
  getPrintfulMode: vi.fn(() => "mock"),
  getPrintfulWebhookSecret: vi.fn(),
}));

const mockParseWebhook = vi.fn();
vi.mock("@/lib/integrations/printful/mockProvider", () => ({
  MockPrintfulProvider: vi.fn().mockImplementation(function (this: any) {
    this.parseWebhook = mockParseWebhook;
  }),
}));
vi.mock("@/lib/integrations/printful/realProvider", () => ({
  PrintfulProvider: vi.fn().mockImplementation(function (this: any) {
    this.parseWebhook = mockParseWebhook;
  }),
}));

const mockRecordAndProcessWebhookEvent = vi.fn();
vi.mock("@/lib/integrations/printful/webhooks", () => ({
  recordAndProcessWebhookEvent: (...args: unknown[]) => mockRecordAndProcessWebhookEvent(...args),
}));

const mockPrisma = { merchandiseOrder: { findFirst: vi.fn() } };
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

async function load() {
  vi.resetModules();
  return import("../route");
}

function makeRequest(url: string, body: unknown) {
  return new Request(url, { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockParseWebhook.mockResolvedValue({ externalEventId: "evt-1", eventType: "ORDER_UPDATED", externalOrderId: null, status: null, raw: {} });
  mockRecordAndProcessWebhookEvent.mockResolvedValue({ alreadyProcessed: false, eventId: "row-1" });
});

describe("POST /api/webhooks/printful — secret verification", () => {
  it("processes the webhook normally when no secret is configured (mock mode / before real credentials arrive)", async () => {
    const { getPrintfulWebhookSecret } = await import("@/lib/integrations/printful/config");
    vi.mocked(getPrintfulWebhookSecret).mockReturnValue(null);

    const { POST } = await load();
    const res = await POST(makeRequest("https://example.com/api/webhooks/printful", { type: "order_updated" }));

    expect(res.status).toBe(200);
    expect(mockRecordAndProcessWebhookEvent).toHaveBeenCalledTimes(1);
  });

  it("rejects with 401 when a secret is configured but the request has no key at all", async () => {
    const { getPrintfulWebhookSecret } = await import("@/lib/integrations/printful/config");
    vi.mocked(getPrintfulWebhookSecret).mockReturnValue("correct-secret");

    const { POST } = await load();
    const res = await POST(makeRequest("https://example.com/api/webhooks/printful", { type: "order_updated" }));

    expect(res.status).toBe(401);
    expect(mockRecordAndProcessWebhookEvent).not.toHaveBeenCalled();
  });

  it("rejects with 401 when the provided key does not match the configured secret", async () => {
    const { getPrintfulWebhookSecret } = await import("@/lib/integrations/printful/config");
    vi.mocked(getPrintfulWebhookSecret).mockReturnValue("correct-secret");

    const { POST } = await load();
    const res = await POST(makeRequest("https://example.com/api/webhooks/printful?key=wrong-secret", { type: "order_updated" }));

    expect(res.status).toBe(401);
    expect(mockRecordAndProcessWebhookEvent).not.toHaveBeenCalled();
  });

  it("processes the webhook when the provided key matches the configured secret", async () => {
    const { getPrintfulWebhookSecret } = await import("@/lib/integrations/printful/config");
    vi.mocked(getPrintfulWebhookSecret).mockReturnValue("correct-secret");

    const { POST } = await load();
    const res = await POST(makeRequest("https://example.com/api/webhooks/printful?key=correct-secret", { type: "order_updated" }));

    expect(res.status).toBe(200);
    expect(mockRecordAndProcessWebhookEvent).toHaveBeenCalledTimes(1);
  });
});
