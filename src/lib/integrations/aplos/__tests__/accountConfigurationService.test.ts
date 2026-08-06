import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { aplosAccountConfiguration: { upsert: vi.fn(), findUnique: vi.fn() }, aplosConnection: { updateMany: vi.fn() } },
}));
vi.mock("../resourceService", () => ({ revalidateAccountSelection: vi.fn(), revalidatePurposeSelection: vi.fn() }));

const depositAccount = { account_number: 1000, name: "Cash", category: "asset", is_enabled: true, type: "Register" };
const expenseAccount = { account_number: 5000, name: "Payroll", category: "expense", is_enabled: true, type: "Standard" };
const purpose = { id: 1, name: "General", is_enabled: true };

describe("saveAccountConfiguration", () => {
  beforeEach(() => vi.clearAllMocks());

  it("saves all three revalidated selections with display-name snapshots", async () => {
    const { saveAccountConfiguration } = await import("../accountConfigurationService");
    const { prisma } = await import("@/lib/prisma");
    const { revalidateAccountSelection, revalidatePurposeSelection } = await import("../resourceService");
    vi.mocked(revalidateAccountSelection).mockImplementation(async (_c, id, type) =>
      ({ success: true, data: type === "deposit" ? depositAccount : expenseAccount } as never)
    );
    vi.mocked(revalidatePurposeSelection).mockResolvedValue({ success: true, data: purpose } as never);

    await saveAccountConfiguration("church-1", { depositAccountId: 1000, processingFeeExpenseAccountId: 5000, defaultPurposeId: 1 });

    const call = vi.mocked(prisma.aplosAccountConfiguration.upsert).mock.calls[0][0] as { create: Record<string, unknown> };
    expect(call.create.depositAccountName).toBe("Cash");
    expect(call.create.processingFeeExpenseAccountName).toBe("Payroll");
    expect(call.create.defaultPurposeName).toBe("General");
  });

  it("rejects and never saves when the deposit account fails revalidation", async () => {
    const { saveAccountConfiguration, ConfigurationValidationError } = await import("../accountConfigurationService");
    const { prisma } = await import("@/lib/prisma");
    const { revalidateAccountSelection, revalidatePurposeSelection } = await import("../resourceService");
    vi.mocked(revalidateAccountSelection).mockImplementation(async (_c, _id, type) =>
      type === "deposit"
        ? ({ success: false, normalized: { category: "VALIDATION_ERROR", retryable: false, safeMessage: "not eligible" } } as never)
        : ({ success: true, data: expenseAccount } as never)
    );
    vi.mocked(revalidatePurposeSelection).mockResolvedValue({ success: true, data: purpose } as never);

    await expect(
      saveAccountConfiguration("church-1", { depositAccountId: 9999, processingFeeExpenseAccountId: 5000, defaultPurposeId: 1 })
    ).rejects.toBeInstanceOf(ConfigurationValidationError);
    expect(prisma.aplosAccountConfiguration.upsert).not.toHaveBeenCalled();
  });

  it("rejects a deposit account of the wrong type even if the ID exists (e.g. an income account)", async () => {
    const { saveAccountConfiguration } = await import("../accountConfigurationService");
    const { revalidateAccountSelection, revalidatePurposeSelection } = await import("../resourceService");
    // revalidateAccountSelection itself only returns eligible accounts for
    // the requested type — an income account passed as "deposit" simply
    // won't be found, which is exactly what this simulates.
    vi.mocked(revalidateAccountSelection).mockResolvedValue({ success: false, normalized: { category: "VALIDATION_ERROR", retryable: false, safeMessage: "wrong type" } } as never);
    vi.mocked(revalidatePurposeSelection).mockResolvedValue({ success: true, data: purpose } as never);

    await expect(saveAccountConfiguration("church-1", { depositAccountId: 4000, processingFeeExpenseAccountId: 5000, defaultPurposeId: 1 })).rejects.toThrow();
  });
});

describe("revalidateSavedConfiguration", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns null when nothing has been saved yet", async () => {
    const { revalidateSavedConfiguration } = await import("../accountConfigurationService");
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.aplosAccountConfiguration.findUnique).mockResolvedValue(null);
    expect(await revalidateSavedConfiguration("church-1")).toBeNull();
  });

  it("reports which of the three selections are still valid", async () => {
    const { revalidateSavedConfiguration } = await import("../accountConfigurationService");
    const { prisma } = await import("@/lib/prisma");
    const { revalidateAccountSelection, revalidatePurposeSelection } = await import("../resourceService");
    vi.mocked(prisma.aplosAccountConfiguration.findUnique).mockResolvedValue({
      depositAccountId: "1000",
      processingFeeExpenseAccountId: "5000",
      defaultPurposeId: "1",
    } as never);
    vi.mocked(revalidateAccountSelection).mockImplementation(async (_c, _id, type) =>
      type === "deposit" ? ({ success: true, data: depositAccount } as never) : ({ success: false, normalized: { category: "VALIDATION_ERROR", retryable: false, safeMessage: "expense account removed" } } as never)
    );
    vi.mocked(revalidatePurposeSelection).mockResolvedValue({ success: true, data: purpose } as never);

    const result = await revalidateSavedConfiguration("church-1");
    expect(result?.depositAccountValid).toBe(true);
    expect(result?.processingFeeExpenseAccountValid).toBe(false);
    expect(result?.errors).toContain("expense account removed");
  });
});
