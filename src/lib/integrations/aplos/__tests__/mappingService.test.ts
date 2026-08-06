import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    fund: { findUnique: vi.fn(), findMany: vi.fn() },
    aplosPurposeMapping: { upsert: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
  },
}));
vi.mock("../resourceService", () => ({ revalidatePurposeSelection: vi.fn() }));

describe("saveFundMapping", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a fund that doesn't exist", async () => {
    const { saveFundMapping, MappingValidationError } = await import("../mappingService");
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.fund.findUnique).mockResolvedValue(null);

    await expect(saveFundMapping("church-1", "fund-x", 1, false)).rejects.toThrow(MappingValidationError);
  });

  it("rejects a fund belonging to a different church (cross-church attack)", async () => {
    const { saveFundMapping, MappingValidationError } = await import("../mappingService");
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.fund.findUnique).mockResolvedValue({ churchId: "other-church", isActive: true } as never);

    try {
      await saveFundMapping("church-1", "fund-x", 1, false);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(MappingValidationError);
      expect((err as InstanceType<typeof MappingValidationError>).code).toBe("CROSS_CHURCH");
    }
  });

  it("rejects an inactive fund", async () => {
    const { saveFundMapping, MappingValidationError } = await import("../mappingService");
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.fund.findUnique).mockResolvedValue({ churchId: "church-1", isActive: false } as never);

    try {
      await saveFundMapping("church-1", "fund-x", 1, false);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(MappingValidationError);
      expect((err as InstanceType<typeof MappingValidationError>).code).toBe("FUND_INACTIVE");
    }
  });

  it("rejects a Purpose that does not currently exist in Aplos", async () => {
    const { saveFundMapping, MappingValidationError } = await import("../mappingService");
    const { prisma } = await import("@/lib/prisma");
    const { revalidatePurposeSelection } = await import("../resourceService");
    vi.mocked(prisma.fund.findUnique).mockResolvedValue({ churchId: "church-1", isActive: true } as never);
    vi.mocked(revalidatePurposeSelection).mockResolvedValue({ success: false, normalized: { category: "VALIDATION_ERROR", retryable: false, safeMessage: "not found" } } as never);

    try {
      await saveFundMapping("church-1", "fund-x", 999, false);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(MappingValidationError);
      expect((err as InstanceType<typeof MappingValidationError>).code).toBe("PURPOSE_NOT_FOUND");
    }
  });

  it("saves the remote id and a display-name snapshot on success", async () => {
    const { saveFundMapping } = await import("../mappingService");
    const { prisma } = await import("@/lib/prisma");
    const { revalidatePurposeSelection } = await import("../resourceService");
    vi.mocked(prisma.fund.findUnique).mockResolvedValue({ churchId: "church-1", isActive: true } as never);
    vi.mocked(revalidatePurposeSelection).mockResolvedValue({ success: true, data: { id: 42, name: "Missions", is_enabled: true } } as never);

    await saveFundMapping("church-1", "fund-x", 42, false);
    const upsertCall = vi.mocked(prisma.aplosPurposeMapping.upsert).mock.calls[0][0] as { create: Record<string, unknown> };
    expect(upsertCall.create.aplosPurposeId).toBe("42");
    expect(upsertCall.create.aplosPurposeName).toBe("Missions");
  });

  it("clears any prior default mapping when saving a new default", async () => {
    const { saveFundMapping } = await import("../mappingService");
    const { prisma } = await import("@/lib/prisma");
    const { revalidatePurposeSelection } = await import("../resourceService");
    vi.mocked(prisma.fund.findUnique).mockResolvedValue({ churchId: "church-1", isActive: true } as never);
    vi.mocked(revalidatePurposeSelection).mockResolvedValue({ success: true, data: { id: 1, name: "General", is_enabled: true } } as never);

    await saveFundMapping("church-1", "fund-x", 1, true);
    expect(prisma.aplosPurposeMapping.updateMany).toHaveBeenCalledWith({ where: { churchId: "church-1", isDefault: true }, data: { isDefault: false } });
  });
});

describe("listFundMappingStatus", () => {
  beforeEach(() => vi.clearAllMocks());

  it("joins active funds with their mapping, marking unmapped funds explicitly", async () => {
    const { listFundMappingStatus } = await import("../mappingService");
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.fund.findMany).mockResolvedValue([
      { id: "fund-1", name: "General", isActive: true },
      { id: "fund-2", name: "Missions", isActive: true },
    ] as never);
    vi.mocked(prisma.aplosPurposeMapping.findMany).mockResolvedValue([
      { wgcFundId: "fund-1", aplosPurposeId: "1", aplosPurposeName: "General Fund Purpose", isDefault: false },
    ] as never);

    const result = await listFundMappingStatus("church-1");
    expect(result.find((f) => f.fundId === "fund-1")?.mapping).not.toBeNull();
    expect(result.find((f) => f.fundId === "fund-2")?.mapping).toBeNull();
  });
});
