import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/lib/auth/requireMerchantSession", () => ({ requireMerchantSession: () => mockAuth() }));
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: vi.fn() }));

const mockFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { donor: { findMany: (...args: unknown[]) => mockFindMany(...args) } } }));

async function loadModule() {
  vi.resetModules();
  return import("@/app/api/merchant/donors/search/route");
}

function req(query?: string) {
  const url = query ? `http://x/api/merchant/donors/search?q=${encodeURIComponent(query)}` : "http://x/api/merchant/donors/search";
  return new Request(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ userId: "user-1", churchId: "church-a" });
  mockFindMany.mockResolvedValue([]);
});

describe("GET /api/merchant/donors/search", () => {
  it("with no query, browses the org's donors alphabetically, capped at 500, scoped to churchId", async () => {
    const { GET } = await loadModule();
    await GET(req());
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { churchId: "church-a", archivedAt: null },
      select: { id: true, name: true, email: true, phone: true },
      take: 500,
      orderBy: { name: "asc" },
    });
  });

  it("with a query, does a name/email/phone contains-match capped at 50, most-recent first", async () => {
    const { GET } = await loadModule();
    await GET(req("jordan"));
    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        churchId: "church-a",
        archivedAt: null,
        OR: [
          { name: { contains: "jordan", mode: "insensitive" } },
          { email: { contains: "jordan", mode: "insensitive" } },
          { phone: { contains: "jordan" } },
        ],
      },
      select: { id: true, name: true, email: true, phone: true },
      take: 50,
      orderBy: { createdAt: "desc" },
    });
  });

  it("reports truncated: true only for an untruncated-query browse hitting the cap exactly", async () => {
    mockFindMany.mockResolvedValue(new Array(500).fill({ id: "d", name: "D", email: "d@a.com", phone: null }));
    const { GET } = await loadModule();
    const res = await GET(req());
    const data = await res.json();
    expect(data.truncated).toBe(true);
  });

  it("never reports truncated for a search (even at its own cap) — truncation only applies to browse-all", async () => {
    mockFindMany.mockResolvedValue(new Array(50).fill({ id: "d", name: "D", email: "d@a.com", phone: null }));
    const { GET } = await loadModule();
    const res = await GET(req("a"));
    const data = await res.json();
    expect(data.truncated).toBe(false);
  });

  it("always scopes to the requester's own churchId — never a client-supplied one", async () => {
    mockAuth.mockResolvedValue({ userId: "user-1", churchId: "church-b" });
    const { GET } = await loadModule();
    await GET(new Request("http://x/api/merchant/donors/search?q=test&churchId=church-EVIL"));
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ churchId: "church-b" }) }));
  });
});
