import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { listAccounts, isDepositAccountEligible, isProcessingFeeExpenseAccountEligible } from "../accounts";

const cashAccount = { account_number: 1000, name: "Cash", category: "asset" as const, is_enabled: true, type: "Register" };
const expenseAccount = { account_number: 5000, name: "Salary & Payroll", category: "expense" as const, is_enabled: true, type: "Standard" };
const incomeAccount = { account_number: 4000, name: "Contributions Income", category: "income" as const, is_enabled: true, type: "Standard" };
const disabledCash = { ...cashAccount, account_number: 1001, is_enabled: false };

describe("account eligibility", () => {
  it("a real Aplos-documented asset ('Cash') account is deposit-eligible", () => {
    expect(isDepositAccountEligible(cashAccount)).toBe(true);
  });
  it("an income account is never deposit-eligible", () => {
    expect(isDepositAccountEligible(incomeAccount)).toBe(false);
  });
  it("a real Aplos-documented expense ('Salary & Payroll') account is processing-fee-eligible", () => {
    expect(isProcessingFeeExpenseAccountEligible(expenseAccount)).toBe(true);
  });
  it("an asset account is never processing-fee-eligible", () => {
    expect(isProcessingFeeExpenseAccountEligible(cashAccount)).toBe(false);
  });
  it("a disabled account is never eligible for either destination", () => {
    expect(isDepositAccountEligible(disabledCash)).toBe(false);
  });
});

describe("listAccounts", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("filters server-side by category when requested", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ version: "v2_0_0", status: 200, data: { accounts: [cashAccount, expenseAccount, incomeAccount] }, links: {} }),
    });
    const result = await listAccounts("tok", "org", { category: "asset" });
    expect(result).toEqual([cashAccount]);
  });

  it("returns everything when no category filter is given", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ version: "v2_0_0", status: 200, data: { accounts: [cashAccount, expenseAccount] }, links: {} }),
    });
    const result = await listAccounts("tok", "org");
    expect(result).toHaveLength(2);
  });
});
