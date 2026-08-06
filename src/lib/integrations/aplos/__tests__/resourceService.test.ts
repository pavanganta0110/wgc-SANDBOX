import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: { aplosConnection: { findUnique: vi.fn() } } }));
vi.mock("../connectionService", () => ({ decryptStoredCredential: vi.fn() }));
vi.mock("../authProvider", () => ({
  // Must be a real class (not an arrow function) — resourceService.ts calls
  // `new ManualCredentialAuthProvider(...)`, and arrow functions cannot be
  // used as constructors.
  ManualCredentialAuthProvider: class {
    getAccessToken = vi.fn().mockResolvedValue({ token: "real-token", expiresAt: new Date() });
  },
}));
vi.mock("../purposes", () => ({ listPurposes: vi.fn() }));
vi.mock("../accounts", () => ({
  listAccounts: vi.fn(),
  isDepositAccountEligible: (a: { category: string }) => a.category === "asset",
  isProcessingFeeExpenseAccountEligible: (a: { category: string }) => a.category === "expense",
}));
vi.mock("../funds", () => ({ listFunds: vi.fn() }));

describe("resourceService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetchChurchPurposes fails safely when the connection is not CONNECTED", async () => {
    const { fetchChurchPurposes, AplosConnectionNotReadyError } = await import("../resourceService");
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue({ status: "DISCONNECTED", aplosOrganizationId: "org-1" } as never);

    const result = await fetchChurchPurposes("church-1");
    expect(result.success).toBe(false);
    void AplosConnectionNotReadyError; // referenced for type-only import sanity
  });

  it("fetchChurchPurposes fails when no connection row exists at all", async () => {
    const { fetchChurchPurposes } = await import("../resourceService");
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue(null);

    const result = await fetchChurchPurposes("church-1");
    expect(result.success).toBe(false);
  });

  it("fetchChurchPurposes succeeds for a CONNECTED church and never leaks the token to the caller", async () => {
    const { fetchChurchPurposes } = await import("../resourceService");
    const { prisma } = await import("@/lib/prisma");
    const { decryptStoredCredential } = await import("../connectionService");
    const { listPurposes } = await import("../purposes");
    vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue({ status: "CONNECTED", aplosOrganizationId: "org-1" } as never);
    vi.mocked(decryptStoredCredential).mockResolvedValue({ clientId: "c", privateKeyMaterial: "k" } as never);
    vi.mocked(listPurposes).mockResolvedValue([{ id: 1, name: "General", is_enabled: true }] as never);

    const result = await fetchChurchPurposes("church-1");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain("real-token");
  });

  it("fetchChurchAccounts filters to deposit-eligible accounts when requested", async () => {
    const { fetchChurchAccounts } = await import("../resourceService");
    const { prisma } = await import("@/lib/prisma");
    const { decryptStoredCredential } = await import("../connectionService");
    const { listAccounts } = await import("../accounts");
    vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue({ status: "CONNECTED", aplosOrganizationId: "org-1" } as never);
    vi.mocked(decryptStoredCredential).mockResolvedValue({ clientId: "c", privateKeyMaterial: "k" } as never);
    vi.mocked(listAccounts).mockResolvedValue([
      { account_number: 1000, name: "Cash", category: "asset", is_enabled: true, type: "Register" },
      { account_number: 5000, name: "Payroll", category: "expense", is_enabled: true, type: "Standard" },
    ] as never);

    const result = await fetchChurchAccounts("church-1", "deposit");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.map((a) => a.account_number)).toEqual([1000]);
  });

  it("revalidateAccountSelection rejects an account not in the eligible set", async () => {
    const { revalidateAccountSelection } = await import("../resourceService");
    const { prisma } = await import("@/lib/prisma");
    const { decryptStoredCredential } = await import("../connectionService");
    const { listAccounts } = await import("../accounts");
    vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue({ status: "CONNECTED", aplosOrganizationId: "org-1" } as never);
    vi.mocked(decryptStoredCredential).mockResolvedValue({ clientId: "c", privateKeyMaterial: "k" } as never);
    vi.mocked(listAccounts).mockResolvedValue([{ account_number: 1000, name: "Cash", category: "asset", is_enabled: true, type: "Register" }] as never);

    const result = await revalidateAccountSelection("church-1", 9999, "deposit");
    expect(result.success).toBe(false);
  });

  it("revalidatePurposeSelection confirms a real, currently-enabled purpose", async () => {
    const { revalidatePurposeSelection } = await import("../resourceService");
    const { prisma } = await import("@/lib/prisma");
    const { decryptStoredCredential } = await import("../connectionService");
    const { listPurposes } = await import("../purposes");
    vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue({ status: "CONNECTED", aplosOrganizationId: "org-1" } as never);
    vi.mocked(decryptStoredCredential).mockResolvedValue({ clientId: "c", privateKeyMaterial: "k" } as never);
    vi.mocked(listPurposes).mockResolvedValue([{ id: 42, name: "Missions", is_enabled: true }] as never);

    const result = await revalidatePurposeSelection("church-1", 42);
    expect(result.success).toBe(true);
  });
});
