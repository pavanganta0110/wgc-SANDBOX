import { describe, it, expect, vi, beforeEach } from "vitest";
import type { User } from "@prisma/client";

const mockSetSessionCookie = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/auth/session", () => ({ setSessionCookie: (...args: unknown[]) => mockSetSessionCookie(...args) }));

const mockTransaction = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: (...args: unknown[]) => mockTransaction(...args), user: { update: vi.fn() }, auditLog: { create: vi.fn() } } }));

async function loadModule() {
  vi.resetModules();
  return import("@/lib/auth/completeAdminLogin");
}

const USER = {
  id: "admin-1",
  email: "admin-1@wgcpayments.com",
  role: "wgc_admin",
  passwordChangedAt: null,
} as unknown as User;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("completeAdminLogin — mfaVerified is signed into the session, never defaulted", () => {
  it("signs mfaVerified: true into the session cookie when called with true (post-OTP path)", async () => {
    const { completeAdminLogin } = await loadModule();
    await completeAdminLogin(USER, "1.2.3.4", "test-agent", true);
    expect(mockSetSessionCookie).toHaveBeenCalledWith(expect.objectContaining({ mfaVerified: true }));
  });

  it("signs mfaVerified: false into the session cookie when called with false (password-only, pre-enrollment path)", async () => {
    const { completeAdminLogin } = await loadModule();
    await completeAdminLogin(USER, "1.2.3.4", "test-agent", false);
    expect(mockSetSessionCookie).toHaveBeenCalledWith(expect.objectContaining({ mfaVerified: false }));
  });
});
