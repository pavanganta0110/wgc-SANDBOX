import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  apiKey: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
  apiRequestLog: { create: vi.fn().mockResolvedValue({}) },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn().mockResolvedValue(undefined) }));

const mockCreate = vi.fn();
vi.mock("@/lib/auth/embedLogin", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/embedLogin")>("@/lib/auth/embedLogin");
  return { ...actual, createEmbedLoginToken: mockCreate };
});

function req(body: unknown, authHeader = "Bearer wgc_live_valid") {
  return new Request("http://wgc.test/api/v1/embed/sessions", {
    method: "POST",
    headers: new Headers({ authorization: authHeader, "content-type": "application/json" }),
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
const emptyCtx = () => ({ params: Promise.resolve({}) });

describe("POST /api/v1/embed/sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete process.env.NEXT_PUBLIC_APP_URL;
    mockPrisma.apiKey.findUnique.mockResolvedValue({ id: "key-1", churchId: "church-a", status: "ACTIVE", scopesJson: ["embed:sessions"] });
    mockCreate.mockResolvedValue({ token: "tok123", expiresAt: new Date("2026-10-28T20:00:00Z"), userId: "user-1" });
  });

  it("returns 401 for an invalid key and 403 for a key without the embed:sessions scope", async () => {
    const { POST } = await import("../route");

    mockPrisma.apiKey.findUnique.mockResolvedValue(null);
    expect((await POST(req({ email: "a@b.org" }), emptyCtx())).status).toBe(401);

    mockPrisma.apiKey.findUnique.mockResolvedValue({ id: "key-1", churchId: "church-a", status: "ACTIVE", scopesJson: ["donations:read"] });
    expect((await POST(req({ email: "a@b.org" }), emptyCtx())).status).toBe(403);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("uses the key's church, never one from the body, and returns a one-time enter link", async () => {
    const { POST } = await import("../route");

    const res = await POST(req({ email: "Staff@Church.org", churchId: "church-b-injection" }), emptyCtx());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ churchId: "church-a", email: "staff@church.org", apiKeyId: "key-1" }));
    expect(body.data.url).toBe("http://wgc.test/merchant/embed/enter?token=tok123");
    expect(body.data.expiresAt).toBe("2026-10-28T20:00:00.000Z");
  });

  it("builds the link on the configured app URL when set", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://www.wgcpayments.com";
    const { POST } = await import("../route");

    const body = await (await POST(req({ email: "staff@church.org" }), emptyCtx())).json();

    expect(body.data.url.startsWith("https://www.wgcpayments.com/merchant/embed/enter?token=")).toBe(true);
  });

  it("only lets the link land on an in-app merchant page, never an external address", async () => {
    const { POST } = await import("../route");

    await POST(req({ email: "staff@church.org", redirectTo: "https://evil.example/steal" }), emptyCtx());
    expect(mockCreate).toHaveBeenLastCalledWith(expect.objectContaining({ redirectTo: "/merchant/dashboard" }));

    await POST(req({ email: "staff@church.org", redirectTo: "//evil.example" }), emptyCtx());
    expect(mockCreate).toHaveBeenLastCalledWith(expect.objectContaining({ redirectTo: "/merchant/dashboard" }));

    await POST(req({ email: "staff@church.org", redirectTo: "/merchant/giving-links" }), emptyCtx());
    expect(mockCreate).toHaveBeenLastCalledWith(expect.objectContaining({ redirectTo: "/merchant/giving-links" }));
  });

  it("rejects a missing or invalid email and a non-JSON body", async () => {
    const { POST } = await import("../route");

    expect((await POST(req({}), emptyCtx())).status).toBe(400);
    expect((await POST(req({ email: "not-an-email" }), emptyCtx())).status).toBe(400);
    expect((await POST(req("not json"), emptyCtx())).status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("maps a missing person to 404 and a refused role, disabled account or MFA user to 403, with a code", async () => {
    const { POST } = await import("../route");
    const { EmbedLoginError } = await import("@/lib/auth/embedLogin");

    mockCreate.mockRejectedValueOnce(new EmbedLoginError("user_not_found", "none"));
    const notFound = await POST(req({ email: "x@y.org" }), emptyCtx());
    expect(notFound.status).toBe(404);

    for (const code of ["role_not_allowed", "user_disabled", "mfa_enabled"] as const) {
      mockCreate.mockRejectedValueOnce(new EmbedLoginError(code, "refused"));
      const res = await POST(req({ email: "x@y.org" }), emptyCtx());
      expect(res.status).toBe(403);
      expect((await res.json()).error.code).toBe(code);
    }
  });
});
