import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  givingLink: { findUnique: vi.fn() },
  church: { findUnique: vi.fn() },
  paymentAttempt: { findUnique: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/finix/client", () => ({ finixClient: {} }));

async function loadModule() {
  vi.resetModules();
  return import("@/app/api/g/[slug]/donate/route");
}

function req(body: unknown, origin: string | null) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (origin) headers.set("origin", origin);
  return new Request("http://localhost/api/g/give-here/donate", { method: "POST", headers, body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("POST /api/g/[slug]/donate — cross-origin embed security", () => {
  it("is reachable with no Origin header at all (the hosted /g/[slug] page's own same-origin fetch) without any CORS check", async () => {
    const { POST } = await loadModule();
    const res = await POST(req({}, null), { params: Promise.resolve({ slug: "give-here" }) });
    // No Origin header means resolveEmbedCorsOrigin is never consulted —
    // the request proceeds straight into the pre-existing donation logic
    // (which 400s here on missing fields, same as it always has).
    expect(mockPrisma.givingLink.findUnique).not.toHaveBeenCalled();
    expect(res.status).toBe(400);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("rejects a cross-origin donation attempt from a domain not on the church's embed allowlist before touching donation logic", async () => {
    mockPrisma.givingLink.findUnique.mockResolvedValueOnce({ churchId: "church-a" }); // embedCors lookup
    mockPrisma.church.findUnique.mockResolvedValueOnce({ embedDomainRestrictionEnabled: true, embedAllowedDomainsJson: ["church.org"] });
    const { POST } = await loadModule();
    const res = await POST(req({}, "https://evil.example.com"), { params: Promise.resolve({ slug: "give-here" }) });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("ORIGIN_NOT_ALLOWED");
    // The heavy donation-logic lookup (a second givingLink.findUnique call
    // inside handleDonate) never runs once origin validation fails.
    expect(mockPrisma.givingLink.findUnique).toHaveBeenCalledTimes(1);
  });

  it("attaches the caller's own origin (never a wildcard) to the response when the origin is approved", async () => {
    mockPrisma.givingLink.findUnique
      .mockResolvedValueOnce({ churchId: "church-a" }) // embedCors lookup
      .mockResolvedValueOnce(null); // handleDonate's own lookup -> 404, cheap path
    mockPrisma.church.findUnique.mockResolvedValueOnce({ embedDomainRestrictionEnabled: false, embedAllowedDomainsJson: [] });
    const { POST } = await loadModule();
    const res = await POST(req({}, "https://random-merchant-site.com"), { params: Promise.resolve({ slug: "give-here" }) });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://random-merchant-site.com");
    expect(res.headers.get("Access-Control-Allow-Origin")).not.toBe("*");
  });

  it("handles an OPTIONS preflight without invoking the donation handler", async () => {
    mockPrisma.givingLink.findUnique.mockResolvedValue({ churchId: "church-a" });
    mockPrisma.church.findUnique.mockResolvedValue({ embedDomainRestrictionEnabled: false, embedAllowedDomainsJson: [] });
    const { OPTIONS } = await loadModule();
    const res = await OPTIONS(req({}, "https://random-merchant-site.com"), { params: Promise.resolve({ slug: "give-here" }) });
    expect(res.status).toBe(204);
    expect(mockPrisma.paymentAttempt.findUnique).not.toHaveBeenCalled();
  });
});
