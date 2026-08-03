import { describe, it, expect, beforeEach, afterEach } from "vitest";

const ORIGINAL_ENV = { ...process.env };

describe("getSmsProvider", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_FROM_NUMBER;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("falls back to a no-op provider that fails gracefully when Twilio isn't configured", async () => {
    const { getSmsProvider } = await import("../smsProvider");
    const provider = getSmsProvider();
    const result = await provider.send("+15555550100", "test");
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
