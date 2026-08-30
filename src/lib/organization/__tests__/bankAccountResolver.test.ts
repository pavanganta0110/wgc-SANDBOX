import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = {
  organizationBankAccount: { findFirst: vi.fn() },
  finixPaymentInstrumentSnapshot: { findFirst: vi.fn() },
  church: { findUnique: vi.fn() },
  onboardingApplication: { findUnique: vi.fn(), findFirst: vi.fn() },
  finixFundingTransferAttempt: { findFirst: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

async function loadModule() {
  vi.resetModules();
  return import("@/lib/organization/bankAccountResolver");
}

describe("resolveActiveBankAccount — deposit-history fallback tier (tier 4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.organizationBankAccount.findFirst.mockResolvedValue(null);
    prismaMock.finixPaymentInstrumentSnapshot.findFirst.mockResolvedValue(null);
    prismaMock.church.findUnique.mockResolvedValue(null);
  });

  it("matches a real deposit with state SUCCEEDED — previously only 'COMPLETED' was queried, matching nothing in production", async () => {
    const { resolveActiveBankAccount } = await loadModule();
    prismaMock.finixFundingTransferAttempt.findFirst.mockResolvedValue({
      bankName: "Security Bank of Kansas City",
      accountHolderName: null,
      bankAccountLast4: "6869",
      bankAccountType: "BUSINESS_CHECKING",
      arrivedAt: null,
      state: "SUCCEEDED",
    });

    const result = await resolveActiveBankAccount("church-a");
    expect(result?.source).toBe("DEPOSIT_HISTORY");
    expect(result?.bankName).toBe("Security Bank of Kansas City");
    expect(prismaMock.finixFundingTransferAttempt.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { churchId: "church-a", state: { in: ["COMPLETED", "SUCCEEDED"] } } })
    );
  });

  it("returns null when no tier has any data (never fabricates)", async () => {
    const { resolveActiveBankAccount } = await loadModule();
    prismaMock.finixFundingTransferAttempt.findFirst.mockResolvedValue(null);

    const result = await resolveActiveBankAccount("church-a");
    expect(result).toBeNull();
  });
});
