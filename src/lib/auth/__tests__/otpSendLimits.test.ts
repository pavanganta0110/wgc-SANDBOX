import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindFirst = vi.fn();
const mockCount = vi.fn();
const mockCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    authSmsSendLog: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      count: (...args: unknown[]) => mockCount(...args),
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
}));

async function loadModule() {
  vi.resetModules();
  return import("@/lib/auth/otpSendLimits");
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFindFirst.mockResolvedValue(null);
  mockCount.mockResolvedValue(0);
  mockCreate.mockResolvedValue({});
});

describe("checkOtpSendLimits — DB-backed, not in-memory (must hold across serverless instances)", () => {
  it("allows a send when there is no prior history", async () => {
    const { checkOtpSendLimits } = await loadModule();
    const result = await checkOtpSendLimits({ userId: "u1", phone: "+15550000000", ipAddress: "1.2.3.4" });
    expect(result.allowed).toBe(true);
  });

  it("blocks with COOLDOWN and a retryAfterSeconds when the last send was under 60s ago", async () => {
    mockFindFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 10_000) });
    const { checkOtpSendLimits } = await loadModule();
    const result = await checkOtpSendLimits({ userId: "u1", phone: "+15550000000", ipAddress: "1.2.3.4" });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("COOLDOWN");
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("allows a send once the cooldown window has passed", async () => {
    mockFindFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 61_000) });
    const { checkOtpSendLimits } = await loadModule();
    const result = await checkOtpSendLimits({ userId: "u1", phone: "+15550000000", ipAddress: "1.2.3.4" });
    expect(result.allowed).toBe(true);
  });

  it("blocks with ACCOUNT_HOURLY at the 5th send in an hour", async () => {
    mockCount.mockImplementation(({ where }: { where: { userId?: string; createdAt?: unknown } }) => {
      if (where.userId && where.createdAt) return Promise.resolve(5); // hourly account count checked first
      return Promise.resolve(0);
    });
    const { checkOtpSendLimits, OTP_MAX_SENDS_PER_ACCOUNT_PER_HOUR } = await loadModule();
    expect(OTP_MAX_SENDS_PER_ACCOUNT_PER_HOUR).toBe(5);
    const result = await checkOtpSendLimits({ userId: "u1", phone: "+15550000000", ipAddress: "1.2.3.4" });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("ACCOUNT_HOURLY");
  });

  it("blocks with PHONE_DAILY when the phone (not the account) has hit its daily cap", async () => {
    let call = 0;
    mockCount.mockImplementation(() => {
      call += 1;
      // Query order in the implementation: hourlyAccount, dailyAccount, dailyPhone, hourlyIp
      if (call === 3) return Promise.resolve(10);
      return Promise.resolve(0);
    });
    const { checkOtpSendLimits } = await loadModule();
    const result = await checkOtpSendLimits({ userId: "u1", phone: "+15550000000", ipAddress: "1.2.3.4" });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("PHONE_DAILY");
  });

  it("skips the IP check entirely when no IP address is available", async () => {
    const { checkOtpSendLimits } = await loadModule();
    await checkOtpSendLimits({ userId: "u1", phone: "+15550000000", ipAddress: null });
    // Only 3 count queries fire (hourly/daily account, daily phone) — the IP
    // branch short-circuits to Promise.resolve(0) instead of querying.
    expect(mockCount).toHaveBeenCalledTimes(3);
  });
});

describe("recordOtpSend", () => {
  it("writes a log row even when providerMessageId is absent (a failed Twilio send still counts)", async () => {
    const { recordOtpSend } = await loadModule();
    await recordOtpSend({ userId: "u1", phone: "+15550000000", purpose: "LOGIN", ipAddress: "1.2.3.4" });
    expect(mockCreate).toHaveBeenCalledWith({
      data: { userId: "u1", phone: "+15550000000", purpose: "LOGIN", ipAddress: "1.2.3.4", providerMessageId: null },
    });
  });
});

describe("otpSendLimitMessage — never reveals which specific limit was hit", () => {
  it("shows the countdown for a cooldown block", async () => {
    const { otpSendLimitMessage } = await loadModule();
    const msg = otpSendLimitMessage({ allowed: false, reason: "COOLDOWN", retryAfterSeconds: 42 });
    expect(msg).toContain("42s");
  });

  it("shows a generic message for every other block reason", async () => {
    const { otpSendLimitMessage } = await loadModule();
    for (const reason of ["ACCOUNT_HOURLY", "ACCOUNT_DAILY", "PHONE_DAILY", "IP_HOURLY"] as const) {
      const msg = otpSendLimitMessage({ allowed: false, reason });
      expect(msg).toBe("Too many verification code requests. Please try again later.");
    }
  });
});
