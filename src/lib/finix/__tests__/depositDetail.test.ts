import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = {
  finixFundingTransferAttempt: { findFirst: vi.fn() },
  church: { findUnique: vi.fn() },
  finixSettlement: { findMany: vi.fn().mockResolvedValue([]) },
  finixTransfer: { findMany: vi.fn().mockResolvedValue([]) },
  finixRefundOrReversal: { findMany: vi.fn().mockResolvedValue([]) },
  bankReturn: { findMany: vi.fn().mockResolvedValue([]) },
  organizationBankAccount: { findFirst: vi.fn().mockResolvedValue(null) },
};
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const resolveActiveBankAccountMock = vi.fn();
vi.mock("@/lib/organization/bankAccountResolver", () => ({
  resolveActiveBankAccount: resolveActiveBankAccountMock,
}));

const getPaymentInstrumentMock = vi.fn();
vi.mock("@/lib/finix/client", () => ({
  finixClient: { getPaymentInstrument: getPaymentInstrumentMock },
}));

async function loadModule() {
  vi.resetModules();
  return import("@/lib/finix/depositDetail");
}

function baseDeposit(overrides: Record<string, unknown> = {}) {
  return {
    finixFundingTransferAttemptId: "TR1",
    churchId: "church-a",
    destinationPaymentInstrumentId: "PI1",
    bankName: null,
    accountHolderName: null,
    bankAccountLast4: null,
    bankAccountType: null,
    finixSettlementId: null,
    ...overrides,
  };
}

describe("loadDepositDetail — live account-holder-name fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.church.findUnique.mockResolvedValue({ id: "church-a", name: "Test Church" });
    resolveActiveBankAccountMock.mockResolvedValue(null);
  });

  it("fetches the account holder name live from Finix when no local source has it", async () => {
    const { loadDepositDetail } = await loadModule();
    prismaMock.finixFundingTransferAttempt.findFirst.mockResolvedValue(baseDeposit());
    getPaymentInstrumentMock.mockResolvedValue({ id: "PI1", name: "Care Package Inbound Inc" });

    const detail = await loadDepositDetail("TR1", "church-a");
    expect(detail?.liveAccountHolderName).toBe("Care Package Inbound Inc");
    expect(getPaymentInstrumentMock).toHaveBeenCalledWith("PI1");
  });

  it("does not call Finix when a local source already has the account holder name", async () => {
    const { loadDepositDetail } = await loadModule();
    prismaMock.finixFundingTransferAttempt.findFirst.mockResolvedValue(baseDeposit({ accountHolderName: "Already Known LLC" }));

    const detail = await loadDepositDetail("TR1", "church-a");
    expect(detail?.liveAccountHolderName).toBeNull();
    expect(getPaymentInstrumentMock).not.toHaveBeenCalled();
  });

  it("never breaks the page when the Finix call fails — returns null instead of throwing", async () => {
    const { loadDepositDetail } = await loadModule();
    prismaMock.finixFundingTransferAttempt.findFirst.mockResolvedValue(baseDeposit());
    getPaymentInstrumentMock.mockRejectedValue(new Error("Finix Error: 404"));

    const detail = await loadDepositDetail("TR1", "church-a");
    expect(detail?.liveAccountHolderName).toBeNull();
  });

  it("does not call Finix when there is no destination payment instrument id to look up", async () => {
    const { loadDepositDetail } = await loadModule();
    prismaMock.finixFundingTransferAttempt.findFirst.mockResolvedValue(baseDeposit({ destinationPaymentInstrumentId: null }));

    const detail = await loadDepositDetail("TR1", "church-a");
    expect(detail?.liveAccountHolderName).toBeNull();
    expect(getPaymentInstrumentMock).not.toHaveBeenCalled();
  });
});
