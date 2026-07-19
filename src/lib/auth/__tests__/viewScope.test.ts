import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MerchantAuthContext } from "@/lib/auth/requireMerchantSession";

const store = new Map<string, string>();
const mockCookieStore = {
  get: vi.fn((name: string) => (store.has(name) ? { value: store.get(name) } : undefined)),
  set: vi.fn((name: string, value: string) => store.set(name, value)),
  delete: vi.fn((name: string) => store.delete(name)),
};
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => mockCookieStore),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
  },
}));

const logDashboardActionMock = vi.fn();
vi.mock("@/lib/dashboardAudit", () => ({
  logDashboardAction: (...args: unknown[]) => logDashboardActionMock(...args),
}));

function makeAuth(overrides: Partial<MerchantAuthContext> = {}): MerchantAuthContext {
  return {
    userId: "owner-1",
    email: "owner@b.com",
    churchId: "church-a",
    rawRole: "owner",
    role: "owner",
    isWgcAdmin: false,
    permissionsJson: null,
    authVersion: 1,
    ...overrides,
  };
}

async function loadModule() {
  vi.resetModules();
  store.clear();
  return import("@/lib/auth/viewScope");
}

describe("resolveViewScope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SESSION_SECRET = "test-secret-at-least-32-characters-long";
  });

  it("CP4A test 1: OWNER with no scope cookie defaults to organization (canViewAllTransactions)", async () => {
    const { resolveViewScope } = await loadModule();
    const resolved = await resolveViewScope(makeAuth({ role: "owner" }));
    expect(resolved.effective).toEqual({ kind: "organization" });
    expect(resolved.isViewingAsOther).toBe(false);
  });

  it("CP4A test 2: ADMIN without canViewAsUser still defaults to organization (base ADMIN has canViewAllTransactions)", async () => {
    const { resolveViewScope } = await loadModule();
    const auth = makeAuth({ role: "admin", rawRole: "admin", permissionsJson: { canViewAsUser: false } });
    const resolved = await resolveViewScope(auth);
    expect(resolved.effective).toEqual({ kind: "organization" });
    expect(resolved.isViewingAsOther).toBe(false);
  });

  it("CP4A test 4: FUNDRAISER defaults to currentUser", async () => {
    const { resolveViewScope } = await loadModule();
    const resolved = await resolveViewScope(makeAuth({ role: "fundraiser", rawRole: "fundraiser" }));
    expect(resolved.effective).toEqual({ kind: "currentUser" });
    expect(resolved.isViewingAsOther).toBe(false);
  });

  it("CP4A test 5: VIEWER defaults to currentUser", async () => {
    const { resolveViewScope } = await loadModule();
    const resolved = await resolveViewScope(makeAuth({ role: "viewer", rawRole: "viewer" }));
    expect(resolved.effective).toEqual({ kind: "currentUser" });
    expect(resolved.isViewingAsOther).toBe(false);
  });

  it("CP4A test 6: VIEWER with an explicit canViewAllTransactions override defaults to organization", async () => {
    const { resolveViewScope } = await loadModule();
    const auth = makeAuth({ role: "viewer", rawRole: "viewer", permissionsJson: { canViewAllTransactions: true } });
    const resolved = await resolveViewScope(auth);
    expect(resolved.effective).toEqual({ kind: "organization" });
  });

  it("CP4A test 3: ADMIN cannot select user:{id} without canViewAsUser, even though they can see organization scope", async () => {
    const { resolveViewScope, setViewScope } = await loadModule();
    const auth = makeAuth({ role: "admin", rawRole: "admin", userId: "admin-1", permissionsJson: { canViewAsUser: false } });
    await setViewScope({ kind: "user", userId: "someone-else" }, auth.userId);
    const resolved = await resolveViewScope(auth);
    // Falls back to ADMIN's own default (organization — they do have
    // canViewAllTransactions), not down to currentUser.
    expect(resolved.effective).toEqual({ kind: "organization" });
  });

  it("does not write a security event or touch cookies for the normal no-cookie case", async () => {
    const { resolveViewScope } = await loadModule();
    await resolveViewScope(makeAuth());
    expect(logDashboardActionMock).not.toHaveBeenCalled();
    expect(mockCookieStore.delete).not.toHaveBeenCalled();
  });

  it("collapses an explicit organization-scope selection for a user without canViewAllTransactions", async () => {
    const { resolveViewScope, setViewScope } = await loadModule();
    const auth = makeAuth({ role: "fundraiser", rawRole: "fundraiser" }); // no canViewAllTransactions
    await setViewScope({ kind: "organization" }, auth.userId);
    const resolved = await resolveViewScope(auth);
    expect(resolved.effective).toEqual({ kind: "currentUser" });
    expect(resolved.isViewingAsOther).toBe(false);
  });

  it("allows explicit organization-scope selection for an owner, and it is NOT treated as viewing-as-other (it's their own normal scope)", async () => {
    const { resolveViewScope, setViewScope } = await loadModule();
    const auth = makeAuth({ role: "owner" });
    await setViewScope({ kind: "organization" }, auth.userId);
    const resolved = await resolveViewScope(auth);
    expect(resolved.effective).toEqual({ kind: "organization" });
    expect(resolved.isViewingAsOther).toBe(false);
  });

  it("rejects a signed scope naming a user in a different church", async () => {
    const { resolveViewScope, setViewScope } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    const auth = makeAuth({ role: "owner" });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "target-1", churchId: "church-B-different" } as never);
    await setViewScope({ kind: "user", userId: "target-1" }, auth.userId);
    const resolved = await resolveViewScope(auth);
    // Falls back to this OWNER's normal default (organization), not a
    // narrower scope — the invalid cookie is discarded, not "escalated
    // down" to currentUser.
    expect(resolved.effective).toEqual({ kind: "organization" });
    expect(mockCookieStore.delete).toHaveBeenCalledWith("wgc_view_scope");
    expect(logDashboardActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "VIEW_SCOPE_REJECTED", metadata: { reason: "cross_organization_target" } })
    );
  });

  it("rejects a manually tampered scope cookie (bad signature), clears it, and logs a safe event", async () => {
    const { resolveViewScope, VIEW_SCOPE_COOKIE_NAME, setViewScope } = await loadModule();
    const auth = makeAuth({ role: "owner" });
    await setViewScope({ kind: "organization" }, auth.userId);
    const original = store.get(VIEW_SCOPE_COOKIE_NAME)!;
    const [payloadB64] = original.split(".");
    store.set(VIEW_SCOPE_COOKIE_NAME, `${payloadB64}.tamperedSignatureXYZ`);

    const resolved = await resolveViewScope(auth);
    expect(resolved.effective).toEqual({ kind: "organization" });
    expect(mockCookieStore.delete).toHaveBeenCalledWith("wgc_view_scope");
    const call = logDashboardActionMock.mock.calls[0][0];
    expect(call.action).toBe("VIEW_SCOPE_REJECTED");
    expect(call.metadata.reason).toBe("invalid_signature_or_expired");
    // Never leaks the raw token/signature into the audit record.
    expect(JSON.stringify(call)).not.toContain("tamperedSignatureXYZ");
  });

  it("rejects a cookie that was set by a different user (no replay across identities)", async () => {
    const { resolveViewScope, setViewScope } = await loadModule();
    await setViewScope({ kind: "organization" }, "someone-else");
    const resolved = await resolveViewScope(makeAuth({ role: "owner" }));
    expect(resolved.effective).toEqual({ kind: "organization" });
    expect(logDashboardActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "VIEW_SCOPE_REJECTED", metadata: { reason: "identity_mismatch" } })
    );
  });

  it("still allows viewing a disabled target user for historical reporting", async () => {
    const { resolveViewScope, setViewScope } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    const auth = makeAuth({ role: "owner" });
    // resolveViewScope's target lookup selects only id/churchId — it does
    // not filter on disabledAt, so a disabled user still resolves here.
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "disabled-1", churchId: "church-a" } as never);
    await setViewScope({ kind: "user", userId: "disabled-1" }, auth.userId);
    const resolved = await resolveViewScope(auth);
    expect(resolved.effective).toEqual({ kind: "user", userId: "disabled-1" });
  });
});

describe("requireFullOrganizationContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SESSION_SECRET = "test-secret-at-least-32-characters-long";
  });

  it("blocks a sensitive action while viewing another user's scope (user:{id}, the actual impersonation case)", async () => {
    const { requireFullOrganizationContext, setViewScope } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    const auth = makeAuth({ role: "owner" });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "someone-else", churchId: "church-a" } as never);
    await setViewScope({ kind: "user", userId: "someone-else" }, auth.userId);
    await expect(requireFullOrganizationContext(auth)).rejects.toThrow(
      /isn't available while viewing another user/i
    );
  });

  it("allows a sensitive action under the default organization scope — that is the OWNER's own normal view, not impersonation", async () => {
    const { requireFullOrganizationContext } = await loadModule();
    await expect(requireFullOrganizationContext(makeAuth({ role: "owner" }))).resolves.toBeUndefined();
  });

  it("allows a sensitive action when explicitly viewing one's own user:{id} scope (selecting yourself is not impersonation)", async () => {
    const { requireFullOrganizationContext, setViewScope } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    const auth = makeAuth({ role: "owner" });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: auth.userId, churchId: "church-a" } as never);
    await setViewScope({ kind: "user", userId: auth.userId }, auth.userId);
    await expect(requireFullOrganizationContext(auth)).resolves.toBeUndefined();
  });
});
