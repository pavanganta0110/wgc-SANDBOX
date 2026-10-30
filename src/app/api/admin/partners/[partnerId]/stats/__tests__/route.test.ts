import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const admin = vi.hoisted(() => ({ requirePartnerAdmin: vi.fn() }));
const loader = vi.hoisted(() => ({ loadPartnerStats: vi.fn() }));
vi.mock("@/lib/partners/requirePartnerAdmin", () => admin);
vi.mock("@/lib/partners/loadPartnerStats", () => loader);

import { GET } from "../route";

const call = (query = "") => GET(new Request(`https://wgc.test/api/admin/partners/p1/stats${query}`), { params: Promise.resolve({ partnerId: "p1" }) });

beforeEach(() => {
  vi.clearAllMocks();
  admin.requirePartnerAdmin.mockResolvedValue({ session: { email: "a@wgc.test" } });
  loader.loadPartnerStats.mockResolvedValue({ totals: {} });
});

describe("GET /api/admin/partners/[partnerId]/stats", () => {
  it("is limited to super admins and never reads data without that", async () => {
    admin.requirePartnerAdmin.mockResolvedValue({ response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });
    expect((await call("?from=2026-10-01&to=2026-10-31")).status).toBe(403);
    expect(loader.loadPartnerStats).not.toHaveBeenCalled();
  });

  it("includes the whole last day and reads only the partner in the path", async () => {
    await call("?from=2026-10-01&to=2026-10-31&partnerId=other");
    const [id, from, to] = loader.loadPartnerStats.mock.calls[0];
    expect(id).toBe("p1");
    expect(from.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(to.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });

  it("rejects bad or reversed dates", async () => {
    expect((await call("?from=nope&to=2026-10-31")).status).toBe(400);
    expect((await call("?from=2026-11-02&to=2026-11-01")).status).toBe(400);
    expect(loader.loadPartnerStats).not.toHaveBeenCalled();
  });

  it("404 for an unknown partner", async () => {
    loader.loadPartnerStats.mockResolvedValue(null);
    expect((await call("?from=2026-10-01&to=2026-10-31")).status).toBe(404);
  });
});
