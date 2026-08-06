import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = { client: { findMany: vi.fn() } };
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

async function importFn() {
  vi.resetModules();
  return import("../clientDuplicates");
}

describe("findPossibleDuplicateClients", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns empty when no identifying fields are given", async () => {
    const { findPossibleDuplicateClients } = await importFn();
    const result = await findPossibleDuplicateClients("church-1", {});
    expect(result).toEqual([]);
    expect(mockPrisma.client.findMany).not.toHaveBeenCalled();
  });

  it("scopes the query to the given church and excludes archived clients", async () => {
    const { findPossibleDuplicateClients } = await importFn();
    mockPrisma.client.findMany.mockResolvedValue([]);
    await findPossibleDuplicateClients("church-1", { normalizedEmail: "a@b.com" });
    expect(mockPrisma.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ churchId: "church-1", archivedAt: null }) })
    );
  });

  it("excludes the client being edited", async () => {
    const { findPossibleDuplicateClients } = await importFn();
    mockPrisma.client.findMany.mockResolvedValue([]);
    await findPossibleDuplicateClients("church-1", { normalizedEmail: "a@b.com" }, "client-self");
    expect(mockPrisma.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { not: "client-self" } }) })
    );
  });

  it("reports which fields actually matched", async () => {
    const { findPossibleDuplicateClients } = await importFn();
    mockPrisma.client.findMany.mockResolvedValue([
      { id: "c1", displayName: "Jane Smith", email: "jane@x.com", normalizedEmail: "jane@x.com", phone: null, normalizedPhone: null, organizationName: null },
    ]);
    const result = await findPossibleDuplicateClients("church-1", { normalizedEmail: "jane@x.com" });
    expect(result).toEqual([
      { id: "c1", displayName: "Jane Smith", email: "jane@x.com", phone: null, organizationName: null, matchedOn: ["email"] },
    ]);
  });

  it("never returns more than the internal cap of results", async () => {
    const { findPossibleDuplicateClients } = await importFn();
    mockPrisma.client.findMany.mockResolvedValue([]);
    await findPossibleDuplicateClients("church-1", { normalizedEmail: "a@b.com" });
    expect(mockPrisma.client.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 10 }));
  });
});
