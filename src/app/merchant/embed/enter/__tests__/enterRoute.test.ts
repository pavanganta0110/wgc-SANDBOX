import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = { user: { findFirst: vi.fn() } };
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

const mockLog = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: (...args: unknown[]) => mockLog(...args) }));

const mockConsume = vi.fn();
vi.mock("@/lib/auth/embedLogin", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/embedLogin")>("@/lib/auth/embedLogin");
  return { ...actual, consumeEmbedLoginToken: (...args: unknown[]) => mockConsume(...args) };
});

const activeStaff = { id: "user-1", email: "staff@church.org", role: "fundraiser", churchId: "church-a", authVersion: 3, disabledAt: null, mfaEnabled: false };
const consumed = { userId: "user-1", churchId: "church-a", redirectTo: "/merchant/dashboard", apiKeyId: "key-1" };

function enter(token = "tok") {
  return new Request(`https://www.wgcpayments.com/merchant/embed/enter?token=${token}`);
}

describe("GET /merchant/embed/enter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.AUTH_SESSION_SECRET = "test-secret-at-least-32-characters-long";
    mockConsume.mockResolvedValue(consumed);
    mockPrisma.user.findFirst.mockResolvedValue(activeStaff);
  });

  it("starts the staff member's own session in a cookie a cross-site iframe can send, then redirects into the dashboard", async () => {
    const { GET } = await import("../route");
    const { verifySessionToken } = await import("@/lib/auth/session");

    const res = await GET(enter());

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://www.wgcpayments.com/merchant/dashboard");
    const cookie = res.headers.get("set-cookie") ?? "";
    for (const attribute of ["wgc_session=", "HttpOnly", "Secure", "SameSite=None", "Partitioned"]) expect(cookie).toContain(attribute);

    const token = cookie.split(";")[0].replace("wgc_session=", "");
    expect(verifySessionToken(token)).toMatchObject({ userId: "user-1", email: "staff@church.org", role: "fundraiser", churchId: "church-a", authVersion: 3 });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("re-checks the person against the link's own church, not just the id", async () => {
    const { GET } = await import("../route");

    await GET(enter());

    expect(mockPrisma.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "user-1", churchId: "church-a" } }));
  });

  it("sends an unknown, expired or used link to the normal login page with no cookie", async () => {
    mockConsume.mockResolvedValue(null);
    const { GET } = await import("../route");

    const res = await GET(enter("bad"));

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://www.wgcpayments.com/merchant/login");
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
  });

  it("refuses to start a session if the person was disabled, turned on MFA, was promoted, or left since the link was issued", async () => {
    const { GET } = await import("../route");
    const changes = [{ disabledAt: new Date() }, { mfaEnabled: true }, { role: "owner" }, { role: "admin" }];

    for (const change of changes) {
      mockPrisma.user.findFirst.mockResolvedValue({ ...activeStaff, ...change });
      const res = await GET(enter());
      expect(res.headers.get("location")).toBe("https://www.wgcpayments.com/merchant/login");
      expect(res.headers.get("set-cookie")).toBeNull();
    }
    mockPrisma.user.findFirst.mockResolvedValue(null);
    expect((await GET(enter())).headers.get("set-cookie")).toBeNull();
  });

  it("never redirects anywhere but an in-app merchant page", async () => {
    mockConsume.mockResolvedValue({ ...consumed, redirectTo: "https://evil.example/x" });
    const { GET } = await import("../route");

    const res = await GET(enter());

    expect(res.headers.get("location")).toBe("https://www.wgcpayments.com/merchant/dashboard");
  });

  it("records who started an embedded session", async () => {
    const { GET } = await import("../route");

    await GET(enter());

    expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({ churchId: "church-a", actorUserId: "user-1", action: "auth.embed_session_started", metadata: { apiKeyId: "key-1" } }));
  });

  it("still starts the session if writing the audit entry fails", async () => {
    mockLog.mockRejectedValueOnce(new Error("audit down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { GET } = await import("../route");

    const res = await GET(enter());

    expect(res.headers.get("set-cookie")).toContain("wgc_session=");
    spy.mockRestore();
  });
});
