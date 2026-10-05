import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/lib/auth/requireMerchantSession", () => ({
  requireMerchantSession: () => mockAuth(),
}));

const mockPrisma = {
  user: { update: vi.fn().mockResolvedValue({}) },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

vi.mock("next/headers", () => ({
  headers: async () => new Map([["x-forwarded-for", "1.2.3.4"], ["user-agent", "test-agent"]]),
}));

const mockIsAuthSmsConfigured = vi.fn(() => true);
const mockSendAuthSms = vi.fn();
vi.mock("@/lib/sms/authSmsSender", () => ({
  isAuthSmsConfigured: () => mockIsAuthSmsConfigured(),
  sendAuthSms: (...args: unknown[]) => mockSendAuthSms(...args),
}));

const mockCheckLimits = vi.fn();
const mockRecordSend = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/auth/otpSendLimits", () => ({
  checkOtpSendLimits: (...args: unknown[]) => mockCheckLimits(...args),
  recordOtpSend: (...args: unknown[]) => mockRecordSend(...args),
  otpSendLimitMessage: () => "Too many verification code requests. Please try again later.",
}));

const mockLogOtpEvent = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/auth/otpAuditLog", () => ({ logOtpEvent: (...args: unknown[]) => mockLogOtpEvent(...args) }));

const mockRecordGranted = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/auth/smsConsent", () => ({ recordSmsConsentGranted: (...args: unknown[]) => mockRecordGranted(...args) }));

async function loadModule() {
  vi.resetModules();
  return import("@/app/api/merchant/settings/security/mfa/enroll/route");
}

function req(body: Record<string, unknown>) {
  return new Request("http://x/api/merchant/settings/security/mfa/enroll", { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ userId: "user-1", churchId: "church-a", email: "u@a.com", authTime: Math.floor(Date.now() / 1000) });
  mockIsAuthSmsConfigured.mockReturnValue(true);
  mockCheckLimits.mockResolvedValue({ allowed: true });
  mockSendAuthSms.mockResolvedValue({ success: true, providerMessageId: "SM123" });
});

describe("POST /api/merchant/settings/security/mfa/enroll — sends via the 2FA-only sender", () => {
  it("calls sendAuthSms (never any donor sender) when consent and phone are valid", async () => {
    const { POST } = await loadModule();
    const res = await POST(req({ phone: "(555) 019-2837", smsConsent: true }));
    expect(res.status).toBe(200);
    expect(mockSendAuthSms).toHaveBeenCalledTimes(1);
    expect(mockRecordGranted).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", churchId: "church-a", source: "settings_security_mfa_enroll" })
    );
  });

  it("returns 503 without sending when the 2FA sender isn't configured", async () => {
    mockIsAuthSmsConfigured.mockReturnValue(false);
    const { POST } = await loadModule();
    const res = await POST(req({ phone: "(555) 019-2837", smsConsent: true }));
    expect(res.status).toBe(503);
    expect(mockSendAuthSms).not.toHaveBeenCalled();
  });

  it("rejects enrollment when the consent checkbox was not checked, even with a valid phone", async () => {
    const { POST } = await loadModule();
    const res = await POST(req({ phone: "(555) 019-2837", smsConsent: false }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/agree to receive SMS/i);
    expect(mockSendAuthSms).not.toHaveBeenCalled();
    expect(mockRecordGranted).not.toHaveBeenCalled();
  });

  it("rejects enrollment when smsConsent is omitted entirely — a phone number alone is never consent", async () => {
    const { POST } = await loadModule();
    const res = await POST(req({ phone: "(555) 019-2837" }));
    expect(res.status).toBe(400);
    expect(mockSendAuthSms).not.toHaveBeenCalled();
  });

  it("rejects a non-boolean-true consent value (defense against a truthy-but-wrong payload)", async () => {
    const { POST } = await loadModule();
    const res = await POST(req({ phone: "(555) 019-2837", smsConsent: "true" }));
    expect(res.status).toBe(400);
    expect(mockSendAuthSms).not.toHaveBeenCalled();
  });

  it("rejects an invalid phone number before ever checking consent, limits, or sending", async () => {
    const { POST } = await loadModule();
    const res = await POST(req({ phone: "not-a-phone", smsConsent: true }));
    expect(res.status).toBe(400);
    expect(mockSendAuthSms).not.toHaveBeenCalled();
    expect(mockCheckLimits).not.toHaveBeenCalled();
  });

  it("returns 429 and never sends when the DB-backed send limit is exceeded", async () => {
    mockCheckLimits.mockResolvedValue({ allowed: false, reason: "ACCOUNT_HOURLY" });
    const { POST } = await loadModule();
    const res = await POST(req({ phone: "(555) 019-2837", smsConsent: true }));
    expect(res.status).toBe(429);
    expect(mockSendAuthSms).not.toHaveBeenCalled();
    expect(mockLogOtpEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "OTP_RATE_LIMITED" }));
  });

  it("does not record consent, and returns a generic error, if the SMS send itself fails", async () => {
    mockSendAuthSms.mockResolvedValue({ success: false, error: "Twilio internal detail that must not leak" });
    const { POST } = await loadModule();
    const res = await POST(req({ phone: "(555) 019-2837", smsConsent: true }));
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).not.toContain("Twilio internal detail");
    expect(mockRecordGranted).not.toHaveBeenCalled();
  });

  it("refuses to enroll when the session is a 'View as Merchant' impersonation — this would otherwise enroll 2FA on the impersonating admin's own account", async () => {
    mockAuth.mockResolvedValue({
      userId: "admin-1",
      churchId: "church-a",
      email: "admin@wgc.com",
      authTime: Math.floor(Date.now() / 1000),
      impersonation: { impersonationSessionId: "imp-1", adminUserId: "admin-1", adminEmail: "admin@wgc.com", targetChurchId: "church-a", targetChurchName: "Test Church" },
    });
    const { POST } = await loadModule();
    const res = await POST(req({ phone: "(555) 019-2837", smsConsent: true }));
    expect(res.status).toBe(403);
    expect(mockSendAuthSms).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("returns 403 with reauthRequired when the session's authTime is stale", async () => {
    mockAuth.mockResolvedValue({ userId: "user-1", churchId: "church-a", email: "u@a.com", authTime: Math.floor(Date.now() / 1000) - 700 });
    const { POST } = await loadModule();
    const res = await POST(req({ phone: "(555) 019-2837", smsConsent: true }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.reauthRequired).toBe(true);
    expect(mockSendAuthSms).not.toHaveBeenCalled();
  });
});
