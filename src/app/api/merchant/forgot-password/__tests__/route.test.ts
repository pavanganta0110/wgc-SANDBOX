import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers({ "x-forwarded-for": "203.0.113.9" })),
}));

const mockSendWgcEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/email", () => ({ sendWgcEmail: (...a: unknown[]) => mockSendWgcEmail(...a) }));

const mockRateLimit = vi.fn().mockReturnValue(true);
vi.mock("@/lib/auth/merchantAuthRateLimit", () => ({
  checkMerchantAuthRateLimit: (...a: unknown[]) => mockRateLimit(...a),
}));

const mockPrisma = {
  user: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

async function post(email: unknown) {
  vi.resetModules();
  const { POST } = await import("../route");
  const res = await POST(
    new Request("http://localhost/api/merchant/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    })
  );
  return { res, body: await res.json() };
}

function user(role: string, extra: Record<string, unknown> = {}) {
  return { id: "u1", email: "person@example.org", role, disabledAt: null, ...extra };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRateLimit.mockReturnValue(true);
  mockPrisma.user.update.mockResolvedValue({});
});

describe("POST /api/merchant/forgot-password", () => {
  it.each(["owner", "admin", "fundraiser", "viewer", "church_admin"])(
    "sends a reset link to a %s",
    async (role) => {
      mockPrisma.user.findUnique.mockResolvedValue(user(role));
      const { res, body } = await post("Person@Example.org ");
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { email: "person@example.org" } });
      expect(mockPrisma.user.update).toHaveBeenCalledTimes(1);
      expect(mockSendWgcEmail).toHaveBeenCalledTimes(1);
      expect(mockSendWgcEmail.mock.calls[0][0].to).toBe("person@example.org");
      expect(mockSendWgcEmail.mock.calls[0][0].bodyHtml).toContain("/merchant/set-password/");
    }
  );

  it.each(["wgc_admin", "wgc_super_admin", "something_else"])("sends nothing to a %s", async (role) => {
    mockPrisma.user.findUnique.mockResolvedValue(user(role));
    const { res, body } = await post("person@example.org");
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    expect(mockSendWgcEmail).not.toHaveBeenCalled();
  });

  it("sends nothing to a disabled account", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(user("owner", { disabledAt: new Date() }));
    const { body } = await post("person@example.org");
    expect(body.success).toBe(true);
    expect(mockSendWgcEmail).not.toHaveBeenCalled();
  });

  it("gives an unknown email the same response as a known one", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(user("owner"));
    const known = await post("person@example.org");
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const unknown = await post("nobody@example.org");
    expect(unknown.res.status).toBe(known.res.status);
    expect(unknown.body).toEqual(known.body);
  });

  it("rejects a missing email and rate-limited callers", async () => {
    expect((await post("")).res.status).toBe(400);
    mockRateLimit.mockReturnValue(false);
    expect((await post("person@example.org")).res.status).toBe(429);
    expect(mockSendWgcEmail).not.toHaveBeenCalled();
  });
});
