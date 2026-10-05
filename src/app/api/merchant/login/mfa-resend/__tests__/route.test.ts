import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindFirst = vi.fn();
const mockUpdate = vi.fn().mockResolvedValue({});
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findFirst: (...args: unknown[]) => mockFindFirst(...args), update: (...args: unknown[]) => mockUpdate(...args) } },
}));

vi.mock("next/headers", () => ({
  headers: async () => new Map([["x-forwarded-for", "1.2.3.4"], ["user-agent", "test-agent"]]),
}));

const mockCheckRateLimit = vi.fn((..._args: unknown[]) => true);
vi.mock("@/lib/auth/merchantAuthRateLimit", () => ({ checkMerchantAuthRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args) }));

const mockSendAuthSms = vi.fn();
vi.mock("@/lib/sms/authSmsSender", () => ({ sendAuthSms: (...args: unknown[]) => mockSendAuthSms(...args) }));

const mockCheckLimits = vi.fn();
const mockRecordSend = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/auth/otpSendLimits", () => ({
  checkOtpSendLimits: (...args: unknown[]) => mockCheckLimits(...args),
  recordOtpSend: (...args: unknown[]) => mockRecordSend(...args),
  otpSendLimitMessage: () => "Please wait before requesting another code.",
  OTP_RESEND_COOLDOWN_SECONDS: 60,
}));

const mockLogOtpEvent = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/auth/otpAuditLog", () => ({ logOtpEvent: (...args: unknown[]) => mockLogOtpEvent(...args) }));

async function loadModule() {
  vi.resetModules();
  return import("@/app/api/merchant/login/mfa-resend/route");
}

function req(challengeId?: string) {
  return new Request("http://x/api/merchant/login/mfa-resend", { method: "POST", body: JSON.stringify(challengeId ? { challengeId } : {}) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckRateLimit.mockReturnValue(true);
  mockCheckLimits.mockResolvedValue({ allowed: true });
  mockSendAuthSms.mockResolvedValue({ success: true, providerMessageId: "SM1" });
  mockFindFirst.mockResolvedValue({
    id: "user-1",
    churchId: "church-a",
    email: "u@a.com",
    phone: "+15551234567",
    mfaCodeHash: "existinghash",
    mfaCodeExpiresAt: new Date(Date.now() + 60_000),
  });
});

describe("POST /api/merchant/login/mfa-resend", () => {
  it("uses only the opaque challengeId to look up the user — never a client-supplied id/email", async () => {
    const { POST } = await loadModule();
    await POST(req("opaque-challenge-abc"));
    expect(mockFindFirst).toHaveBeenCalledWith({ where: { mfaLoginChallengeId: "opaque-challenge-abc" } });
  });

  it("returns a generic 'session expired' error for a missing challengeId, never revealing account existence", async () => {
    const { POST } = await loadModule();
    const res = await POST(req(undefined));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).not.toMatch(/exist|found|invalid user/i);
  });

  it("returns the same generic error when the challenge doesn't resolve to any user", async () => {
    mockFindFirst.mockResolvedValue(null);
    const { POST } = await loadModule();
    const res = await POST(req("bogus"));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("This verification session has expired. Please log in again.");
  });

  it("enforces the DB-backed cooldown and returns retryAfterSeconds without sending", async () => {
    mockCheckLimits.mockResolvedValue({ allowed: false, reason: "COOLDOWN", retryAfterSeconds: 37 });
    const { POST } = await loadModule();
    const res = await POST(req("challenge-1"));
    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.retryAfterSeconds).toBe(37);
    expect(mockSendAuthSms).not.toHaveBeenCalled();
  });

  it("generates a brand-new code and resets attempts to 0, invalidating the previous code", async () => {
    const { POST } = await loadModule();
    await POST(req("challenge-1"));
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: expect.objectContaining({ mfaCodeAttempts: 0 }),
    });
    const updateData = mockUpdate.mock.calls[0][0].data;
    expect(updateData.mfaCodeHash).not.toBe("existinghash");
  });

  it("sends via sendAuthSms (the 2FA-only sender) and logs OTP_RESENT on success", async () => {
    const { POST } = await loadModule();
    const res = await POST(req("challenge-1"));
    expect(res.status).toBe(200);
    expect(mockSendAuthSms).toHaveBeenCalledTimes(1);
    expect(mockLogOtpEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "OTP_RESENT" }));
  });
});
