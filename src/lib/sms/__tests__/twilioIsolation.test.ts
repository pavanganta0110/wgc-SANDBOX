import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * These tests exist specifically to prove the Priority-1 guarantee from
 * the 2FA/donor-messaging separation work: our Twilio A2P 10DLC campaign
 * is approved for authentication traffic only, so it must be technically
 * impossible for donor/campaign/invoice messaging to send through the
 * 2FA-approved sender, and technically impossible for the 2FA env vars
 * alone to "turn on" donor SMS.
 */

const ORIGINAL_ENV = { ...process.env };

function resetEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_2FA_FROM_NUMBER;
  delete process.env.TWILIO_DONOR_FROM_NUMBER;
  delete process.env.TWILIO_FROM_NUMBER;
}

beforeEach(() => {
  resetEnv();
  vi.resetModules();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  resetEnv();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("authSmsSender — the only module allowed to reach the 2FA sender", () => {
  it("isAuthSmsConfigured() is false with no Twilio env vars set", async () => {
    const { isAuthSmsConfigured } = await import("@/lib/sms/authSmsSender");
    expect(isAuthSmsConfigured()).toBe(false);
  });

  it("isAuthSmsConfigured() is false when only the account credentials are set (no 2FA number)", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC123";
    process.env.TWILIO_AUTH_TOKEN = "secret";
    const { isAuthSmsConfigured } = await import("@/lib/sms/authSmsSender");
    expect(isAuthSmsConfigured()).toBe(false);
  });

  it("isAuthSmsConfigured() is true once all three 2FA vars are set", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC123";
    process.env.TWILIO_AUTH_TOKEN = "secret";
    process.env.TWILIO_2FA_FROM_NUMBER = "+15551234567";
    const { isAuthSmsConfigured } = await import("@/lib/sms/authSmsSender");
    expect(isAuthSmsConfigured()).toBe(true);
  });

  it("sendAuthSms() sends From the 2FA number and never touches TWILIO_FROM_NUMBER or TWILIO_DONOR_FROM_NUMBER", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC123";
    process.env.TWILIO_AUTH_TOKEN = "secret";
    process.env.TWILIO_2FA_FROM_NUMBER = "+15551234567";
    process.env.TWILIO_FROM_NUMBER = "+15559999999"; // legacy var — must be ignored
    process.env.TWILIO_DONOR_FROM_NUMBER = "+15558888888"; // must be ignored

    const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ sid: "SM123" }) });

    const { sendAuthSms } = await import("@/lib/sms/authSmsSender");
    const result = await sendAuthSms("+15550000000", "Your code is 123456");

    expect(result.success).toBe(true);
    const [, init] = mockFetch.mock.calls[0];
    const body = new URLSearchParams(init.body as string);
    expect(body.get("From")).toBe("+15551234567");
  });
});

describe("sendText (donor/campaign sender) — hard-disabled until TWILIO_DONOR_FROM_NUMBER is deliberately introduced", () => {
  it("isSmsConfigured() is false even though the 2FA sender is fully configured", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC123";
    process.env.TWILIO_AUTH_TOKEN = "secret";
    process.env.TWILIO_2FA_FROM_NUMBER = "+15551234567";

    const { isSmsConfigured } = await import("@/lib/sms/sendText");
    expect(isSmsConfigured()).toBe(false);
  });

  it("sendText() refuses to send (and never calls fetch) while only the 2FA number is configured", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC123";
    process.env.TWILIO_AUTH_TOKEN = "secret";
    process.env.TWILIO_2FA_FROM_NUMBER = "+15551234567";

    const { sendText } = await import("@/lib/sms/sendText");
    const result = await sendText("+15550000000", "hi");

    expect(result.success).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("isSmsConfigured() becomes true only once TWILIO_DONOR_FROM_NUMBER is explicitly set", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC123";
    process.env.TWILIO_AUTH_TOKEN = "secret";
    process.env.TWILIO_DONOR_FROM_NUMBER = "+15558888888";

    const { isSmsConfigured } = await import("@/lib/sms/sendText");
    expect(isSmsConfigured()).toBe(true);
  });
});

describe("Invoice reminder SMS — hard no-op regardless of any Twilio configuration", () => {
  it("never attempts to send even when every Twilio var (2FA and donor) is fully configured", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC123";
    process.env.TWILIO_AUTH_TOKEN = "secret";
    process.env.TWILIO_2FA_FROM_NUMBER = "+15551234567";
    process.env.TWILIO_DONOR_FROM_NUMBER = "+15558888888";

    const { sendInvoiceReminderSms } = await import("@/lib/invoices/invoiceSms");
    const result = await sendInvoiceReminderSms("invoice-1", "token-abc", "overdue");

    expect(result).toEqual({ attempted: false, success: false });
    expect(fetch).not.toHaveBeenCalled();
  });
});
