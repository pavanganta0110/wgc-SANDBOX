import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/lib/auth/requireMerchantSession", () => ({ requireMerchantSession: () => mockAuth() }));
const mockPrisma = vi.hoisted(() => ({ helpSearchLog: { create: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

const user = { userId: "u1", churchId: "church-1" };

async function search(q: string | null) {
  vi.resetModules();
  const { GET } = await import("@/app/api/merchant/support/help-search/route");
  const url = q === null ? "http://x/api/merchant/support/help-search" : `http://x/api/merchant/support/help-search?q=${encodeURIComponent(q)}`;
  return GET(new Request(url));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(user);
  mockPrisma.helpSearchLog.create.mockResolvedValue({});
});

describe("GET /api/merchant/support/help-search", () => {
  it("returns the best matching articles with question and answer text", async () => {
    const res = await search("how do I print a receipt");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.matched).toBe(true);
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.results.length).toBeLessThanOrEqual(3);
    const top = body.results[0];
    expect(top).toEqual(expect.objectContaining({ slug: expect.any(String), title: expect.any(String), question: expect.any(String), answer: expect.any(String) }));
    expect(top.answer).not.toMatch(/<[a-z]/i);
  });

  it("says nothing matched for a question the Help Center does not cover", async () => {
    const body = await (await search("banana smoothie recipe")).json();
    expect(body).toEqual({ matched: false, results: [] });
  });

  it("rejects an empty or one-letter question", async () => {
    expect((await search(null)).status).toBe(400);
    expect((await search("   ")).status).toBe(400);
    expect((await search("a")).status).toBe(400);
    expect(mockPrisma.helpSearchLog.create).not.toHaveBeenCalled();
  });

  it("logs a masked copy of what was asked, for the signed-in organization", async () => {
    await search("my card 4242 4242 4242 4242 failed, email jane@example.com");
    const data = mockPrisma.helpSearchLog.create.mock.calls[0][0].data;
    expect(data.churchId).toBe("church-1");
    expect(data.userId).toBe("u1");
    expect(data.query).toBe("my card [number] failed, email [email]");
    expect(data.query).not.toMatch(/4242|jane@/);
  });

  it("records whether an answer was found and which article came first", async () => {
    await search("banana smoothie recipe");
    expect(mockPrisma.helpSearchLog.create.mock.calls[0][0].data).toMatchObject({ matched: false, topSlug: null, topScore: null });
    await search("how do I print a receipt");
    expect(mockPrisma.helpSearchLog.create.mock.calls[1][0].data).toMatchObject({ matched: true, topSlug: expect.any(String) });
  });

  it("still answers when the log cannot be written", async () => {
    mockPrisma.helpSearchLog.create.mockRejectedValue(new Error("table missing"));
    const res = await search("how do I print a receipt");
    expect(res.status).toBe(200);
    expect((await res.json()).matched).toBe(true);
  });

  it("does not store the user id for a WGC admin viewing as the merchant", async () => {
    mockAuth.mockResolvedValue({ ...user, impersonation: { adminEmail: "a@wgc.com" } });
    await search("how do I print a receipt");
    expect(mockPrisma.helpSearchLog.create.mock.calls[0][0].data.userId).toBeNull();
  });

  it("limits how fast one user can search", async () => {
    vi.resetModules();
    const { GET } = await import("@/app/api/merchant/support/help-search/route");
    const call = () => GET(new Request("http://x/api/merchant/support/help-search?q=how%20do%20I%20print%20a%20receipt"));
    let last = 200;
    for (let i = 0; i < 25; i++) last = (await call()).status;
    expect(last).toBe(429);
  });

  it("answers 401 and never searches or logs for someone who is not signed in", async () => {
    vi.resetModules();
    const { GET } = await import("@/app/api/merchant/support/help-search/route");
    const { UnauthorizedError } = await import("@/lib/auth/errors"); // same module copy the route uses
    mockAuth.mockRejectedValue(new UnauthorizedError());
    const res = await GET(new Request("http://x/api/merchant/support/help-search?q=how%20do%20I%20print%20a%20receipt"));
    expect(res.status).toBe(401);
    expect(mockPrisma.helpSearchLog.create).not.toHaveBeenCalled();
  });
});
