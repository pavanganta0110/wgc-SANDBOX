import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPaymentFindUnique = vi.fn();
const mockDonorFindUnique = vi.fn();
const mockConnectionFindUnique = vi.fn();
const mockSyncRecordFindFirst = vi.fn();
const mockSyncRecordCreate = vi.fn();
const mockSyncRecordUpdate = vi.fn();
const mockConnectionUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    payment: { findUnique: (...args: unknown[]) => mockPaymentFindUnique(...args) },
    donor: { findUnique: (...args: unknown[]) => mockDonorFindUnique(...args) },
    quickBooksConnection: {
      findUnique: (...args: unknown[]) => mockConnectionFindUnique(...args),
      update: (...args: unknown[]) => mockConnectionUpdate(...args),
    },
    quickBooksSyncRecord: {
      findFirst: (...args: unknown[]) => mockSyncRecordFindFirst(...args),
      create: (...args: unknown[]) => mockSyncRecordCreate(...args),
      update: (...args: unknown[]) => mockSyncRecordUpdate(...args),
    },
  },
}));

const mockIsEnabled = vi.fn(() => true);
const mockIsConfigured = vi.fn(() => true);
vi.mock("../config", () => ({
  isQuickBooksIntegrationEnabled: () => mockIsEnabled(),
  isQuickBooksIntegrationConfigured: () => mockIsConfigured(),
}));

const mockFindCustomer = vi.fn();
const mockCreateCustomer = vi.fn();
const mockCreatePayment = vi.fn();
const mockGetResourceClient = vi.fn(async (_churchId: string) => ({
  findCustomerByDisplayName: mockFindCustomer,
  createCustomer: mockCreateCustomer,
  createPayment: mockCreatePayment,
}));
vi.mock("../service", () => ({
  getResourceClientForChurch: (churchId: string) => mockGetResourceClient(churchId),
}));

async function load() {
  vi.resetModules();
  return import("../sync");
}

describe("syncPaymentToQuickBooks — money-mixing safety and idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsEnabled.mockReturnValue(true);
    mockIsConfigured.mockReturnValue(true);
  });

  it("does nothing when the integration is disabled — never even reads the payment", async () => {
    mockIsEnabled.mockReturnValue(false);
    const { syncPaymentToQuickBooks } = await load();
    await syncPaymentToQuickBooks("payment-1");
    expect(mockPaymentFindUnique).not.toHaveBeenCalled();
  });

  it("does nothing when the church has no QuickBooksConnection row at all — an org that never connected is never touched", async () => {
    mockPaymentFindUnique.mockResolvedValue({ id: "payment-1", churchId: "church-1", donorId: null, donationAmountCents: 2500, amountCents: 2500 });
    mockConnectionFindUnique.mockResolvedValue(null);
    const { syncPaymentToQuickBooks } = await load();
    await syncPaymentToQuickBooks("payment-1");
    expect(mockGetResourceClient).not.toHaveBeenCalled();
  });

  it("does nothing when the connection exists but isn't CONNECTED (e.g. DISCONNECTED, ERROR)", async () => {
    mockPaymentFindUnique.mockResolvedValue({ id: "payment-1", churchId: "church-1", donorId: null, donationAmountCents: 2500, amountCents: 2500 });
    mockConnectionFindUnique.mockResolvedValue({ id: "conn-1", status: "DISCONNECTED" });
    const { syncPaymentToQuickBooks } = await load();
    await syncPaymentToQuickBooks("payment-1");
    expect(mockGetResourceClient).not.toHaveBeenCalled();
  });

  it("skips re-syncing a payment that already SUCCEEDED — idempotent against retries/duplicate calls", async () => {
    mockPaymentFindUnique.mockResolvedValue({ id: "payment-1", churchId: "church-1", donorId: null, donationAmountCents: 2500, amountCents: 2500 });
    mockConnectionFindUnique.mockResolvedValue({ id: "conn-1", status: "CONNECTED" });
    mockSyncRecordFindFirst.mockResolvedValue({ id: "sync-1", status: "SUCCEEDED" });
    const { syncPaymentToQuickBooks } = await load();
    await syncPaymentToQuickBooks("payment-1");
    expect(mockGetResourceClient).not.toHaveBeenCalled();
  });

  it("creates a customer + payment and marks the sync record SUCCEEDED on the happy path", async () => {
    mockPaymentFindUnique.mockResolvedValue({ id: "payment-1", churchId: "church-1", donorId: "donor-1", donationAmountCents: 2500, amountCents: 2500 });
    mockDonorFindUnique.mockResolvedValue({ id: "donor-1", name: "Test Donor", email: "donor@example.com" });
    mockConnectionFindUnique.mockResolvedValue({ id: "conn-1", status: "CONNECTED" });
    mockSyncRecordFindFirst.mockResolvedValue(null);
    mockSyncRecordCreate.mockResolvedValue({ id: "sync-1" });
    mockFindCustomer.mockResolvedValue(null);
    mockCreateCustomer.mockResolvedValue({ Id: "qb-customer-1", DisplayName: "Test Donor" });
    mockCreatePayment.mockResolvedValue({ Id: "qb-payment-1" });

    const { syncPaymentToQuickBooks } = await load();
    await syncPaymentToQuickBooks("payment-1");

    expect(mockCreateCustomer).toHaveBeenCalledWith(expect.objectContaining({ DisplayName: "Test Donor" }));
    expect(mockCreatePayment).toHaveBeenCalledWith(expect.objectContaining({ CustomerRef: { value: "qb-customer-1" }, TotalAmt: 25 }));
    expect(mockSyncRecordUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SUCCEEDED", quickBooksEntityId: "qb-payment-1" }) })
    );
  });

  it("never throws even when the QuickBooks API call fails — records FAILED instead of propagating to the caller", async () => {
    mockPaymentFindUnique.mockResolvedValue({ id: "payment-1", churchId: "church-1", donorId: null, donationAmountCents: 2500, amountCents: 2500 });
    mockConnectionFindUnique.mockResolvedValue({ id: "conn-1", status: "CONNECTED" });
    mockSyncRecordFindFirst.mockResolvedValue(null);
    mockSyncRecordCreate.mockResolvedValue({ id: "sync-1" });
    mockFindCustomer.mockRejectedValue(new Error("QuickBooks API is down"));

    const { syncPaymentToQuickBooks } = await load();
    await expect(syncPaymentToQuickBooks("payment-1")).resolves.toBeUndefined();
    expect(mockSyncRecordUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) })
    );
  });

  it("never throws even when the payment itself can't be loaded (e.g. a bad id)", async () => {
    mockPaymentFindUnique.mockRejectedValue(new Error("db unreachable"));
    const { syncPaymentToQuickBooks } = await load();
    await expect(syncPaymentToQuickBooks("payment-1")).resolves.toBeUndefined();
  });
});
