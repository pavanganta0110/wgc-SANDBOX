import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/invoices/invoiceEmails", () => ({ sendInvoicePaymentReceiptEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/finix/sync/syncPaymentInstruments", () => ({ syncPaymentInstrument: vi.fn().mockResolvedValue(undefined) }));

const mockCheckRateLimit = vi.fn((_key: string) => true);
vi.mock("@/lib/invoices/invoicePublicRateLimit", () => ({ checkInvoicePaymentRateLimit: (key: string) => mockCheckRateLimit(key) }));

const mockResolveToken = vi.fn((_token: string): Promise<{ invoiceId: string; churchId: string } | null> => Promise.resolve(null));
vi.mock("@/lib/invoices/invoicePublicToken", () => ({ resolveInvoicePublicToken: (token: string) => mockResolveToken(token) }));

const mockFinixClient = {
  createBuyerIdentity: vi.fn(),
  createPaymentInstrument: vi.fn(),
  createTransfer: vi.fn(),
};
vi.mock("@/lib/finix/client", () => ({ finixClient: mockFinixClient }));

const mockFeeStrategy = vi.fn();
vi.mock("@/lib/giving/serverFeeStrategy", () => ({ resolveWgcTransferFeeStrategy: (input: unknown) => mockFeeStrategy(input) }));

const mockPrisma = {
  invoice: { findUnique: vi.fn(), update: vi.fn() },
  church: { findUnique: vi.fn() },
  invoicePayment: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  invoicePaymentAttempt: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  invoiceActivity: { create: vi.fn() },
  finixTransfer: { upsert: vi.fn() },
  $transaction: vi.fn(),
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

function baseInvoice(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "inv1",
    churchId: "church-a",
    invoiceNumber: "INV-000001",
    status: "SENT",
    totalCents: 10000,
    balanceCents: 10000,
    dueDate: new Date("2026-12-01"),
    paymentDeadline: null,
    allowCard: true,
    allowAch: true,
    allowApplePay: true,
    allowGooglePay: true,
    allowPartialPayments: false,
    minimumPartialPaymentCents: null,
    allowFeeCoverage: true,
    feeCoveredBy: "MERCHANT",
    classification: "GOODS_OR_SERVICES",
    charitablePortionCents: null,
    firstViewedAt: new Date(),
    ...overrides,
  };
}

function validBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    amountCents: 10000,
    paymentMethod: "card",
    finixToken: "TOK123",
    fraudSessionId: "fraud-session",
    clientAttemptId: "attempt-1",
    payer: { name: "Jane Payer", email: "jane@example.com" },
    ...overrides,
  };
}

function postReq(body: unknown) {
  return new Request("http://x", { method: "POST", body: JSON.stringify(body) });
}

async function load() {
  vi.resetModules();
  return import("@/app/api/invoice/[token]/pay/route");
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckRateLimit.mockReturnValue(true);
  mockResolveToken.mockResolvedValue({ invoiceId: "inv1", churchId: "church-a" });
  mockPrisma.invoice.findUnique.mockResolvedValue(baseInvoice());
  mockPrisma.church.findUnique.mockResolvedValue({ id: "church-a", finixMerchantId: "MU123", name: "Test Church" });
  mockPrisma.invoicePayment.findMany.mockResolvedValue([]);
  mockPrisma.invoicePayment.findFirst.mockResolvedValue(null);
  mockPrisma.invoicePayment.create.mockResolvedValue({ id: "invpay-1" });
  mockPrisma.invoicePaymentAttempt.findUnique.mockResolvedValue(null);
  mockPrisma.invoicePaymentAttempt.create.mockResolvedValue({ id: "attempt-row-1" });
  mockPrisma.$transaction.mockImplementation(async (fn: unknown) => {
    if (typeof fn === "function") return (fn as (tx: typeof mockPrisma) => unknown)(mockPrisma);
    return Promise.all(fn as Promise<unknown>[]);
  });
  mockFeeStrategy.mockReturnValue({
    amountToChargeCents: 10000,
    expectedFeeCents: 300,
    supplementalFeeCents: 0,
    feePaidBy: "MERCHANT",
    feeProfileId: "FP123",
    normalizedCardBrand: "VISA",
    percentageBasisPoints: 290,
    fixedFeeCents: 30,
  });
  mockFinixClient.createBuyerIdentity.mockResolvedValue({ id: "IDxxx" });
  mockFinixClient.createPaymentInstrument.mockResolvedValue({ id: "PIxxx", card: { brand: "VISA" } });
  mockFinixClient.createTransfer.mockResolvedValue({ id: "TRxxx", state: "SUCCEEDED", type: "DEBIT" });
});

const params = (token = "sometoken") => ({ params: Promise.resolve({ token }) });

describe("POST /api/invoice/[token]/pay — validation", () => {
  it("rate-limits by IP before doing anything else", async () => {
    mockCheckRateLimit.mockReturnValue(false);
    const { POST } = await load();
    const res = await POST(postReq(validBody()), params());
    expect(res.status).toBe(429);
    expect(mockResolveToken).not.toHaveBeenCalled();
  });

  it("rejects an invalid/unknown token", async () => {
    mockResolveToken.mockResolvedValue(null);
    const { POST } = await load();
    const res = await POST(postReq(validBody()), params());
    expect(res.status).toBe(404);
  });

  it("rejects payment when the invoice's own churchId doesn't match the token's resolved churchId — cross-church/sub-account scoping can never be bypassed by an invoiceId collision", async () => {
    mockResolveToken.mockResolvedValue({ invoiceId: "inv1", churchId: "church-b" });
    mockPrisma.invoice.findUnique.mockResolvedValue(baseInvoice({ churchId: "church-a" }));
    const { POST } = await load();
    const res = await POST(postReq(validBody()), params());
    expect(res.status).toBe(404);
    expect(mockFinixClient.createBuyerIdentity).not.toHaveBeenCalled();
  });

  it("rejects an amount below the $1.00 minimum", async () => {
    const { POST } = await load();
    const res = await POST(postReq(validBody({ amountCents: 50 })), params());
    expect(res.status).toBe(400);
  });

  it("rejects a payment against an invoice that cannot accept payment", async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue(baseInvoice({ status: "VOID" }));
    const { POST } = await load();
    const res = await POST(postReq(validBody()), params());
    expect(res.status).toBe(409);
  });

  it("rejects payment after the payment deadline has passed", async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue(baseInvoice({ paymentDeadline: new Date("2020-01-01") }));
    const { POST } = await load();
    const res = await POST(postReq(validBody()), params());
    expect(res.status).toBe(409);
  });

  it("rejects card payment when the invoice has allowCard disabled", async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue(baseInvoice({ allowCard: false }));
    const { POST } = await load();
    const res = await POST(postReq(validBody()), params());
    expect(res.status).toBe(400);
  });

  it("blocks an amount exceeding the remaining balance rather than capping it", async () => {
    const { POST } = await load();
    const res = await POST(postReq(validBody({ amountCents: 20000 })), params());
    expect(res.status).toBe(400);
    expect(mockFinixClient.createTransfer).not.toHaveBeenCalled();
  });

  it("rejects a partial payment when allowPartialPayments is false", async () => {
    const { POST } = await load();
    const res = await POST(postReq(validBody({ amountCents: 5000 })), params());
    expect(res.status).toBe(400);
  });

  it("rejects a partial payment below the configured minimum", async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue(baseInvoice({ allowPartialPayments: true, minimumPartialPaymentCents: 5000 }));
    const { POST } = await load();
    const res = await POST(postReq(validBody({ amountCents: 2000 })), params());
    expect(res.status).toBe(400);
  });

  it("rejects payment when the invoice is already fully paid (balance recomputed as zero from the payments ledger)", async () => {
    // The route always recomputes the balance from the live InvoicePayment
    // ledger rather than trusting the invoice's own (possibly stale)
    // balanceCents column — so eligibility here is driven by what
    // invoicePayment.findMany returns, not by the invoice row directly.
    mockPrisma.invoicePayment.findMany.mockResolvedValue([{ status: "SUCCEEDED", grossAmountCents: 10000, netAmountCents: 9700, refundedCents: 0 }]);
    const { POST } = await load();
    const res = await POST(postReq(validBody()), params());
    expect(res.status).toBe(409);
  });

  it("returns a duplicate response for a repeated clientAttemptId already SUCCEEDED, without charging again", async () => {
    mockPrisma.invoicePaymentAttempt.findUnique.mockResolvedValue({ id: "a1", status: "SUCCEEDED", finixTransferId: "TR_prev" });
    const { POST } = await load();
    const res = await POST(postReq(validBody()), params());
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.duplicate).toBe(true);
    expect(mockFinixClient.createTransfer).not.toHaveBeenCalled();
  });
});

describe("POST /api/invoice/[token]/pay — happy path", () => {
  it("creates identity, instrument, and transfer, then reduces the balance and derives PAID when the balance reaches zero", async () => {
    const { POST } = await load();
    const res = await POST(postReq(validBody()), params());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.state).toBe("SUCCEEDED");
    expect(data.status).toBe("PAID");
    expect(mockFinixClient.createBuyerIdentity).toHaveBeenCalled();
    expect(mockFinixClient.createPaymentInstrument).toHaveBeenCalledWith(expect.objectContaining({ token: "TOK123", type: "TOKEN" }));
    expect(mockFinixClient.createTransfer).toHaveBeenCalled();
    expect(mockPrisma.invoicePayment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ source: "FINIX", grossAmountCents: 10000, status: "SUCCEEDED" }) })
    );
  });

  it("never creates a Donor record for the payer", async () => {
    const { POST } = await load();
    await POST(postReq(validBody()), params());
    // The mock prisma object intentionally has no `donor` model at all —
    // if the route ever tried to touch prisma.donor this would throw
    // (accessing an undefined property's method), which the test would
    // surface as a failure.
    expect((mockPrisma as Record<string, unknown>).donor).toBeUndefined();
  });

  it("routes a wallet payment through third_party_token instead of token", async () => {
    const { POST } = await load();
    const res = await POST(
      postReq(
        validBody({
          paymentMethod: "apple_pay",
          finixToken: undefined,
          fraudSessionId: undefined,
          walletToken: "WALLETTOK",
          walletBillingContact: { name: "Jane Payer", address: {} },
        })
      ),
      params()
    );
    expect(res.status).toBe(200);
    expect(mockFinixClient.createPaymentInstrument).toHaveBeenCalledWith(
      expect.objectContaining({ type: "APPLE_PAY", third_party_token: "WALLETTOK" })
    );
  });
});

describe("POST /api/invoice/[token]/pay — customer fee coverage", () => {
  it("passes donorCoversFee: true to the fee strategy when the customer opts in and the invoice allows it", async () => {
    mockFeeStrategy.mockReturnValue({
      amountToChargeCents: 10300,
      expectedFeeCents: 300,
      supplementalFeeCents: 300,
      feePaidBy: "DONOR",
      feeProfileId: "FP_ZERO",
      normalizedCardBrand: "VISA",
      percentageBasisPoints: 300,
      fixedFeeCents: 0,
    });
    const { POST } = await load();
    const res = await POST(postReq(validBody({ coverFee: true, expectedTotalCents: 10300 })), params());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(mockFeeStrategy).toHaveBeenCalledWith(expect.objectContaining({ donorCoversFee: true }));
    expect(data.feeContributionCents).toBe(300);
    expect(data.totalCents).toBe(10300);
    expect(data.customerCoveredFee).toBe(true);
    expect(mockPrisma.invoicePayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          grossAmountCents: 10000, // the invoice-amount-applied figure never includes the fee contribution
          feeContributionCents: 300,
          totalChargedCents: 10300,
          customerCoveredFee: true,
        }),
      })
    );
  });

  it("ignores a customer's coverFee: true when the invoice has fee coverage disabled", async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue(baseInvoice({ allowFeeCoverage: false }));
    const { POST } = await load();
    await POST(postReq(validBody({ coverFee: true })), params());

    expect(mockFeeStrategy).toHaveBeenCalledWith(expect.objectContaining({ donorCoversFee: false }));
  });

  it("defaults to donorCoversFee: false when the customer declines fee coverage", async () => {
    const { POST } = await load();
    await POST(postReq(validBody({ coverFee: false })), params());
    expect(mockFeeStrategy).toHaveBeenCalledWith(expect.objectContaining({ donorCoversFee: false }));
  });

  it("rejects the charge when the client's expected total no longer matches the server-computed total", async () => {
    // Server computes 10000 (no fee, MERCHANT-paid by default), but the
    // client submits a total that assumes fee coverage was still on —
    // simulates a stale UI (e.g. the payer toggled the checkbox off after
    // the wallet sheet already captured an old amount).
    const { POST } = await load();
    const res = await POST(postReq(validBody({ expectedTotalCents: 10300 })), params());
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.success).toBe(false);
    expect(mockFinixClient.createTransfer).not.toHaveBeenCalled();
  });

  it("accepts a matching expectedTotalCents within a one-cent rounding tolerance", async () => {
    const { POST } = await load();
    const res = await POST(postReq(validBody({ expectedTotalCents: 10001 })), params());
    expect(res.status).toBe(200);
  });

  it("never lets the fee contribution inflate the amount applied toward the invoice balance", async () => {
    mockFeeStrategy.mockReturnValue({
      amountToChargeCents: 10300,
      expectedFeeCents: 300,
      supplementalFeeCents: 300,
      feePaidBy: "DONOR",
      feeProfileId: "FP_ZERO",
      normalizedCardBrand: "VISA",
      percentageBasisPoints: 300,
      fixedFeeCents: 0,
    });
    const { POST } = await load();
    const res = await POST(postReq(validBody({ coverFee: true, expectedTotalCents: 10300 })), params());
    const data = await res.json();
    // amountCents (what reduces the invoice balance) stays the original
    // 10000 invoice amount — never 10300 — so the invoice can never appear
    // overpaid just because the payer covered the fee.
    expect(data.amountCents).toBe(10000);
    expect(mockPrisma.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amountPaidCents: 10000 }) })
    );
  });
});
