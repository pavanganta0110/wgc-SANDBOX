import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The admin Merchants directory filters: created-date range (inclusive of the whole end day), name-only search vs the
 * broad search, and rejection of bad dates. The raw SQL's WHERE clause is inspected rather than run against a database.
 */

const mockQueryRaw = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: (...a: unknown[]) => mockQueryRaw(...a) } }));
vi.mock("@/lib/auth/session", () => ({ getAdminSession: vi.fn().mockResolvedValue({ email: "admin@wgc.test" }) }));
vi.mock("@/lib/audit", () => ({ createAuditLog: vi.fn().mockResolvedValue(undefined) }));

import { GET } from "../route";

type SqlLike = { sql: string; values: unknown[] };

/** The WHERE clause is the first interpolated Sql value of the first query (the count query). */
function whereOfFirstQuery(): SqlLike {
  const values = mockQueryRaw.mock.calls[0].slice(1) as unknown[];
  const where = values.find((v): v is SqlLike => typeof v === "object" && v !== null && "sql" in (v as object));
  if (!where) throw new Error("no WHERE clause found");
  return where;
}

function get(qs: string) {
  return GET(new Request(`http://x/api/admin/merchants?${qs}`));
}

beforeEach(() => {
  mockQueryRaw.mockReset();
  mockQueryRaw.mockResolvedValueOnce([{ count: BigInt(0) }]).mockResolvedValueOnce([]);
});

describe("GET /api/admin/merchants — filters", () => {
  it("applies no date or name condition when no filters are given", async () => {
    const res = await get("");
    expect(res.status).toBe(200);
    const where = whereOfFirstQuery();
    expect(where.sql).not.toContain('"createdAt"');
    expect(where.sql).not.toContain("ILIKE");
  });

  it("filters created date as >= start and < the day after the end day (the end day is fully included)", async () => {
    const res = await get("createdDateStart=2026-10-01&createdDateEnd=2026-10-08");
    expect(res.status).toBe(200);
    const where = whereOfFirstQuery();
    expect(where.sql).toContain('c."createdAt" >=');
    expect(where.sql).toContain('c."createdAt" <');
    expect(where.sql).not.toContain('c."createdAt" <=');
    const dates = where.values.filter((v): v is Date => v instanceof Date).map((d) => d.toISOString());
    expect(dates).toEqual(["2026-10-01T00:00:00.000Z", "2026-10-09T00:00:00.000Z"]);
  });

  it("name-only search matches the merchant name and nothing else", async () => {
    await get("search=light&searchField=name");
    const where = whereOfFirstQuery();
    expect(where.sql).toContain("c.name ILIKE");
    expect(where.sql).not.toContain("u.email ILIKE");
    expect(where.sql).not.toContain("GivingLink");
    expect(where.values).toContain("%light%");
  });

  it("the default search keeps the broad behavior (name, owner, email, id, giving pages)", async () => {
    await get("search=light");
    const where = whereOfFirstQuery();
    expect(where.sql).toContain("u.email ILIKE");
    expect(where.sql).toContain("GivingLink");
  });

  it("rejects an invalid or reversed date range with a 400 and runs no query", async () => {
    expect((await get("createdDateStart=nope")).status).toBe(400);
    expect((await get("createdDateStart=2026-10-09&createdDateEnd=2026-10-01")).status).toBe(400);
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });

  it("returns the total as totalCount (what the page reads for 'of N results')", async () => {
    mockQueryRaw.mockReset();
    mockQueryRaw.mockResolvedValueOnce([{ count: BigInt(42) }]).mockResolvedValueOnce([]);
    const body = await (await get("")).json();
    expect(body.pagination.totalCount).toBe(42);
  });
});
