import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";

const mockUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
vi.mock("@/lib/prisma", () => ({ prisma: { authSmsSendLog: { updateMany: (...args: unknown[]) => mockUpdateMany(...args) } } }));

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (key: string) => (key === "x-twilio-signature" ? currentSignatureHeader : null),
  }),
}));

let currentSignatureHeader: string | null = null;

const AUTH_TOKEN = "test-auth-token";
const CALLBACK_URL = "https://app.example.com/api/webhooks/twilio/auth-status";

function sign(url: string, params: Record<string, string>, token: string): string {
  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const key of sortedKeys) data += key + params[key];
  return crypto.createHmac("sha1", token).update(Buffer.from(data, "utf-8")).digest("base64");
}

function req(params: Record<string, string>, signature: string | null) {
  currentSignatureHeader = signature;
  return new Request(CALLBACK_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
}

async function loadModule() {
  vi.resetModules();
  return import("@/app/api/webhooks/twilio/auth-status/route");
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

describe("POST /api/webhooks/twilio/auth-status — signature verification", () => {
  it("rejects a request with no signature header", async () => {
    const { POST } = await loadModule();
    const res = await POST(req({ MessageSid: "SM1", MessageStatus: "delivered" }, null));
    expect(res.status).toBe(403);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects a request with an incorrect signature", async () => {
    const params = { MessageSid: "SM1", MessageStatus: "delivered" };
    const { POST } = await loadModule();
    const res = await POST(req(params, "forged-signature-value"));
    expect(res.status).toBe(403);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it("accepts a correctly-signed request and updates the matching AuthSmsSendLog row", async () => {
    const params = { MessageSid: "SM123", MessageStatus: "delivered" };
    const signature = sign(CALLBACK_URL, params, AUTH_TOKEN);
    const { POST } = await loadModule();
    const res = await POST(req(params, signature));
    expect(res.status).toBe(200);
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { providerMessageId: "SM123" },
      data: expect.objectContaining({ deliveryStatus: "DELIVERED", errorCode: null }),
    });
  });

  it("records the errorCode for an undelivered message", async () => {
    const params = { MessageSid: "SM456", MessageStatus: "undelivered", ErrorCode: "30003" };
    const signature = sign(CALLBACK_URL, params, AUTH_TOKEN);
    const { POST } = await loadModule();
    await POST(req(params, signature));
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { providerMessageId: "SM456" },
      data: expect.objectContaining({ deliveryStatus: "UNDELIVERED", errorCode: "30003" }),
    });
  });

  it("rejects when TWILIO_AUTH_TOKEN isn't configured, rather than skipping verification", async () => {
    delete process.env.TWILIO_AUTH_TOKEN;
    const params = { MessageSid: "SM1", MessageStatus: "delivered" };
    const { POST } = await loadModule();
    const res = await POST(req(params, "any-signature"));
    expect(res.status).toBe(403);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });
});
