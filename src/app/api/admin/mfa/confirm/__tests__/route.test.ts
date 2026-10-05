import { describe, it, expect, vi, beforeEach } from "vitest";
import { hashMfaCode } from "@/lib/auth/mfaCode";

const mockGetAdminSession = vi.fn();
const mockSetSessionCookie = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/auth/session", () => ({
  getAdminSession: () => mockGetAdminSession(),
  setSessionCookie: (...args: unknown[]) => mockSetSessionCookie(...args),
}));

const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: (...args: unknown[]) => mockFindUnique(...args), update: (...args: unknown[]) => mockUpdate(...args) } },
}));

vi.mock("next/headers", () => ({
  headers: async () => new Map([["x-forwarded-for", "1.2.3.4"], ["user-agent", "test-agent"]]),
}));

const mockLogOtpEvent = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/auth/otpAuditLog", () => ({ logOtpEvent: (...args: unknown[]) => mockLogOtpEvent(...args) }));

async function loadModule() {
  vi.resetModules();
  return import("@/app/api/admin/mfa/confirm/route");
}

function req(code: string) {
  return new Request("http://x/api/admin/mfa/confirm", { method: "POST", body: JSON.stringify({ code }) });
}

const CODE = "111222";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAdminSession.mockResolvedValue({ userId: "admin-1", email: "admin-1@wgcpayments.com", name: "Admin", role: "wgc_admin", mfaEnabled: false, mfaVerified: false });
});

describe("POST /api/admin/mfa/confirm — reissues the CURRENT session as mfaVerified: true on success", () => {
  it("calls setSessionCookie with mfaVerified: true after a correct code, tying MFA success to this session immediately", async () => {
    mockFindUnique.mockResolvedValue({
      id: "admin-1",
      pendingPhone: "+15551234567",
      mfaCodeHash: hashMfaCode(CODE),
      mfaCodeExpiresAt: new Date(Date.now() + 60_000),
      mfaCodeAttempts: 0,
      mfaEnabled: false,
    });
    mockUpdate.mockResolvedValue({
      id: "admin-1",
      email: "admin-1@wgcpayments.com",
      role: "wgc_admin",
      passwordChangedAt: null,
    });

    const { POST } = await loadModule();
    const res = await POST(req(CODE));

    expect(res.status).toBe(200);
    expect(mockSetSessionCookie).toHaveBeenCalledWith(expect.objectContaining({ userId: "admin-1", mfaVerified: true }));
  });

  it("does not reissue the session cookie when the code is wrong", async () => {
    mockFindUnique.mockResolvedValue({
      id: "admin-1",
      pendingPhone: "+15551234567",
      mfaCodeHash: hashMfaCode(CODE),
      mfaCodeExpiresAt: new Date(Date.now() + 60_000),
      mfaCodeAttempts: 0,
      mfaEnabled: false,
    });
    mockUpdate.mockResolvedValue({});

    const { POST } = await loadModule();
    const res = await POST(req("000000"));

    expect(res.status).toBe(400);
    expect(mockSetSessionCookie).not.toHaveBeenCalled();
  });
});
