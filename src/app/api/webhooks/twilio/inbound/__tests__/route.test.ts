import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";

const mockPrisma = {
  textToGiveKeyword: { findUnique: vi.fn() },
  fundraisingCampaign: { findUnique: vi.fn() },
  church: { findUnique: vi.fn() },
  textToGiveInboundMessage: { create: vi.fn().mockResolvedValue({}) },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

const mockIsSmsConfigured = vi.fn();
const mockSendText = vi.fn();
vi.mock("@/lib/sms/sendText", () => ({ isSmsConfigured: () => mockIsSmsConfigured(), sendText: (...a: unknown[]) => mockSendText(...a) }));

let currentSignatureHeader: string | null = null;
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (key: string) => (key === "x-twilio-signature" ? currentSignatureHeader : null) }),
}));

const AUTH_TOKEN = "test-auth-token";
const CALLBACK_URL = "https://app.example.com/api/webhooks/twilio/inbound";

function sign(url: string, params: Record<string, string>, token: string): string {
  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const key of sortedKeys) data += key + params[key];
  return crypto.createHmac("sha1", token).update(Buffer.from(data, "utf-8")).digest("base64");
}

function req(params: Record<string, string>) {
  currentSignatureHeader = sign(CALLBACK_URL, params, AUTH_TOKEN);
  return new Request(CALLBACK_URL, { method: "POST", body: new URLSearchParams(params).toString() });
}

async function loadModule() {
  vi.resetModules();
  return import("@/app/api/webhooks/twilio/inbound/route");
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.TWILIO_AUTH_TOKEN = AUTH_TOKEN;
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("POST /api/webhooks/twilio/inbound", () => {
  it("rejects a request with an invalid signature", async () => {
    currentSignatureHeader = "forged";
    const { POST } = await loadModule();
    const res = await POST(new Request(CALLBACK_URL, { method: "POST", body: new URLSearchParams({ Body: "BUILDING" }).toString() }));
    expect(res.status).toBe(403);
    expect(mockPrisma.textToGiveInboundMessage.create).not.toHaveBeenCalled();
  });

  it("logs the inbound message even when no keyword matches", async () => {
    mockPrisma.textToGiveKeyword.findUnique.mockResolvedValue(null);
    const { POST } = await loadModule();
    await POST(req({ Body: "RANDOM TEXT", From: "+15551234567", To: "+15559876543" }));

    expect(mockPrisma.textToGiveInboundMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ churchId: null, matchedKeywordId: null, replySent: false }) })
    );
    expect(mockSendText).not.toHaveBeenCalled();
  });

  it("never sends a reply while SMS is not configured, even for a matched active keyword", async () => {
    mockPrisma.textToGiveKeyword.findUnique.mockResolvedValue({ id: "kw1", churchId: "church-a", status: "ACTIVE", fundraisingCampaignId: "c1", replyMessageTemplate: null });
    mockIsSmsConfigured.mockReturnValue(false);
    const { POST } = await loadModule();
    await POST(req({ Body: "BUILDING", From: "+15551234567", To: "+15559876543" }));

    expect(mockSendText).not.toHaveBeenCalled();
    expect(mockPrisma.textToGiveInboundMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ matchedKeywordId: "kw1", replySent: false, replyError: expect.stringContaining("not yet configured") }) })
    );
  });

  it("never sends a reply for a PAUSED keyword even if SMS is configured", async () => {
    mockPrisma.textToGiveKeyword.findUnique.mockResolvedValue({ id: "kw1", churchId: "church-a", status: "PAUSED", fundraisingCampaignId: "c1", replyMessageTemplate: null });
    mockIsSmsConfigured.mockReturnValue(true);
    const { POST } = await loadModule();
    await POST(req({ Body: "BUILDING", From: "+15551234567", To: "+15559876543" }));

    expect(mockSendText).not.toHaveBeenCalled();
  });

  it("sends the reply and logs success once SMS is configured and the keyword is active", async () => {
    mockPrisma.textToGiveKeyword.findUnique.mockResolvedValue({ id: "kw1", churchId: "church-a", status: "ACTIVE", fundraisingCampaignId: "c1", replyMessageTemplate: null });
    mockPrisma.fundraisingCampaign.findUnique.mockResolvedValue({ slug: "new-roof", name: "New Roof Fund" });
    mockPrisma.church.findUnique.mockResolvedValue({ name: "Grace Church" });
    mockIsSmsConfigured.mockReturnValue(true);
    mockSendText.mockResolvedValue({ success: true });

    const { POST } = await loadModule();
    await POST(req({ Body: "building", From: "+15551234567", To: "+15559876543" }));

    expect(mockSendText).toHaveBeenCalledWith("+15551234567", expect.stringContaining("New Roof Fund"));
    expect(mockPrisma.textToGiveInboundMessage.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ replySent: true }) }));
  });
});
