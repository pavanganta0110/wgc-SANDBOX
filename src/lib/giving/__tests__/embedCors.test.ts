import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  givingLink: { findUnique: vi.fn() },
  church: { findUnique: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

async function loadModule() {
  vi.resetModules();
  return import("@/lib/giving/embedCors");
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("resolveEmbedCorsOrigin", () => {
  it("returns null when there is no Origin header (same-origin request, no CORS headers needed)", async () => {
    const { resolveEmbedCorsOrigin } = await loadModule();
    const result = await resolveEmbedCorsOrigin("slug-a", null);
    expect(result).toBeNull();
    expect(mockPrisma.givingLink.findUnique).not.toHaveBeenCalled();
  });

  it("returns null for a slug that doesn't exist — never leaks which slugs are real via CORS", async () => {
    const { resolveEmbedCorsOrigin } = await loadModule();
    mockPrisma.givingLink.findUnique.mockResolvedValue(null);
    const result = await resolveEmbedCorsOrigin("missing-slug", "https://church.org");
    expect(result).toBeNull();
  });

  it("echoes back the caller's own origin (never a wildcard) when the church has not enabled domain restriction", async () => {
    const { resolveEmbedCorsOrigin } = await loadModule();
    mockPrisma.givingLink.findUnique.mockResolvedValue({ churchId: "church-a" });
    mockPrisma.church.findUnique.mockResolvedValue({ embedDomainRestrictionEnabled: false, embedAllowedDomainsJson: [] });
    const result = await resolveEmbedCorsOrigin("slug-a", "https://random-church-site.org");
    expect(result).toBe("https://random-church-site.org");
  });

  it("rejects an origin not on the allowlist when domain restriction is enabled", async () => {
    const { resolveEmbedCorsOrigin } = await loadModule();
    mockPrisma.givingLink.findUnique.mockResolvedValue({ churchId: "church-a" });
    mockPrisma.church.findUnique.mockResolvedValue({ embedDomainRestrictionEnabled: true, embedAllowedDomainsJson: ["church.org"] });
    const result = await resolveEmbedCorsOrigin("slug-a", "https://evil.example.com");
    expect(result).toBeNull();
  });

  it("accepts an origin on the allowlist when domain restriction is enabled", async () => {
    const { resolveEmbedCorsOrigin } = await loadModule();
    mockPrisma.givingLink.findUnique.mockResolvedValue({ churchId: "church-a" });
    mockPrisma.church.findUnique.mockResolvedValue({ embedDomainRestrictionEnabled: true, embedAllowedDomainsJson: ["church.org"] });
    const result = await resolveEmbedCorsOrigin("slug-a", "https://www.church.org");
    expect(result).toBe("https://www.church.org");
  });
});

describe("embedCorsHeaders", () => {
  it("never sets Access-Control-Allow-Origin to a wildcard", async () => {
    const { embedCorsHeaders } = await loadModule();
    const headers = embedCorsHeaders("https://church.org") as Record<string, string>;
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://church.org");
    expect(headers["Access-Control-Allow-Origin"]).not.toBe("*");
    expect(headers["Vary"]).toBe("Origin");
  });

  it("omits Access-Control-Allow-Origin entirely when the origin was not approved", async () => {
    const { embedCorsHeaders } = await loadModule();
    const headers = embedCorsHeaders(null) as Record<string, string>;
    expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });
});

describe("embedPreflightResponse", () => {
  it("returns 204 with CORS headers for an approved origin", async () => {
    const { embedPreflightResponse } = await loadModule();
    const res = embedPreflightResponse("https://church.org");
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://church.org");
  });

  it("returns 403 without an Allow-Origin header for a rejected origin", async () => {
    const { embedPreflightResponse } = await loadModule();
    const res = embedPreflightResponse(null);
    expect(res.status).toBe(403);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
