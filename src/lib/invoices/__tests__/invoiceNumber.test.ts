import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = { invoiceSettings: { upsert: vi.fn() } };
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

async function importFn() {
  vi.resetModules();
  return import("../invoiceNumber");
}

describe("generateNextInvoiceNumber", () => {
  beforeEach(() => vi.clearAllMocks());

  it("formats the first invoice as INV-000001", async () => {
    const { generateNextInvoiceNumber } = await importFn();
    mockPrisma.invoiceSettings.upsert.mockResolvedValue({ nextInvoiceSequence: 2, invoiceNumberPrefix: "INV-" });
    const number = await generateNextInvoiceNumber("church-1");
    expect(number).toBe("INV-000001");
  });

  it("uses a single atomic upsert with increment, not a separate read-then-write", async () => {
    const { generateNextInvoiceNumber } = await importFn();
    mockPrisma.invoiceSettings.upsert.mockResolvedValue({ nextInvoiceSequence: 43, invoiceNumberPrefix: "INV-" });
    await generateNextInvoiceNumber("church-1");
    expect(mockPrisma.invoiceSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { churchId: "church-1" },
        update: { nextInvoiceSequence: { increment: 1 } },
      })
    );
  });

  it("respects a custom prefix", async () => {
    const { generateNextInvoiceNumber } = await importFn();
    mockPrisma.invoiceSettings.upsert.mockResolvedValue({ nextInvoiceSequence: 6, invoiceNumberPrefix: "ACME-" });
    const number = await generateNextInvoiceNumber("church-1");
    expect(number).toBe("ACME-000005");
  });

  it("pads the sequence to 6 digits", async () => {
    const { generateNextInvoiceNumber } = await importFn();
    mockPrisma.invoiceSettings.upsert.mockResolvedValue({ nextInvoiceSequence: 1000000, invoiceNumberPrefix: "INV-" });
    const number = await generateNextInvoiceNumber("church-1");
    expect(number).toBe("INV-999999");
  });
});

describe("isValidCustomInvoiceNumber", () => {
  it("accepts a reasonable custom number", async () => {
    const { isValidCustomInvoiceNumber } = await importFn();
    expect(isValidCustomInvoiceNumber("PO-2026-001")).toBe(true);
  });

  it("rejects an empty string", async () => {
    const { isValidCustomInvoiceNumber } = await importFn();
    expect(isValidCustomInvoiceNumber("   ")).toBe(false);
  });

  it("rejects characters that would break URLs/CSV/PDF rendering", async () => {
    const { isValidCustomInvoiceNumber } = await importFn();
    expect(isValidCustomInvoiceNumber("INV#001<script>")).toBe(false);
  });

  it("rejects an overly long value", async () => {
    const { isValidCustomInvoiceNumber } = await importFn();
    expect(isValidCustomInvoiceNumber("A".repeat(51))).toBe(false);
  });
});
