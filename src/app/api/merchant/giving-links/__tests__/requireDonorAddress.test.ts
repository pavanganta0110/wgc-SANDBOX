import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/lib/auth/requireMerchantSession", () => ({ requireMerchantSession: () => mockAuth() }));
vi.mock("@/lib/auth/givingLinkOwnership", () => ({
  resolveGivingLinkOwnerForCreate: vi.fn().mockResolvedValue("user-1"),
  validateGivingLinkReassignment: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/auth/viewScope", () => ({ resolveViewScope: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/auth/scopes", () => ({ buildGivingLinkScope: vi.fn().mockReturnValue({}) }));
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn().mockResolvedValue(undefined) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const mockPrisma = {
  givingLink: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  givingLinkFund: { count: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() },
  church: { findUnique: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

const owner = () => ({ userId: "user-1", email: "owner@church.org", churchId: "church-a", role: "owner", rawRole: "owner" });
const req = (body: unknown, method = "POST") => new Request("http://x", { method, body: JSON.stringify(body) });
const params = { params: Promise.resolve({ id: "link-1" }) };

function createBody(overrides: Record<string, unknown> = {}) {
  return {
    internalName: "Main",
    publicTitle: "Give",
    amountType: "VARIABLE",
    suggestedAmountsCents: [2500, 5000],
    allowCustomAmount: true,
    recurringEnabled: false,
    allowedFrequencies: ["MONTHLY"],
    allowedPaymentMethods: ["CARD"],
    ...overrides,
  };
}

const existingLink = () => ({
  id: "link-1",
  churchId: "church-a",
  publicSlug: "give",
  ownerUserId: "user-1",
  amountType: "VARIABLE",
  minAmountCents: null,
  maxAmountCents: null,
  suggestedAmountsJson: [2500, 5000],
  allowCustomAmount: true,
  recurringEnabled: false,
  fundSelectionEnabled: false,
  defaultDonationType: "ONE_TIME",
  defaultRecurringAmountCents: null,
  brandingSettingsJson: null,
  donorFieldSettingsJson: { street: "OPTIONAL" },
});

async function loadCreate() {
  vi.resetModules();
  return import("../route");
}
async function loadUpdate() {
  vi.resetModules();
  return import("../[id]/route");
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(owner());
  mockPrisma.givingLink.findUnique.mockResolvedValue(null);
  mockPrisma.givingLink.findFirst.mockResolvedValue(existingLink());
  mockPrisma.givingLink.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "new-link", ...data }));
  mockPrisma.givingLink.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...existingLink(), ...data }));
});

describe("organization-wide required donor address — creating a link", () => {
  it("forces the address to be collected and required, whatever the form sent", async () => {
    mockPrisma.church.findUnique.mockResolvedValue({ defaultCollectMailingAddressOnNewLinks: false, requireDonorAddress: true });
    const { POST } = await loadCreate();

    const res = await POST(req(createBody({ collectMailingAddress: false, donorFieldSettings: { street: "HIDDEN" } })));

    expect(res.status).toBeLessThan(300);
    const data = mockPrisma.givingLink.create.mock.calls[0][0].data;
    expect(data.collectMailingAddress).toBe(true);
    expect(data.donorFieldSettingsJson.street).toBe("REQUIRED");
  });

  it("leaves the form's own values alone when the organization rule is off", async () => {
    mockPrisma.church.findUnique.mockResolvedValue({ defaultCollectMailingAddressOnNewLinks: true, requireDonorAddress: false });
    const { POST } = await loadCreate();

    await POST(req(createBody({ collectMailingAddress: false, donorFieldSettings: { street: "HIDDEN" } })));

    const data = mockPrisma.givingLink.create.mock.calls[0][0].data;
    expect(data.collectMailingAddress).toBe(false);
    expect(data.donorFieldSettingsJson).toEqual({ street: "HIDDEN" });
  });
});

describe("organization-wide required donor address — editing a link", () => {
  it("keeps the link collecting and requiring the address even when the edit tries to turn it off", async () => {
    mockPrisma.church.findUnique.mockResolvedValue({ requireDonorAddress: true });
    const { PATCH } = await loadUpdate();

    await PATCH(req({ collectMailingAddress: false, donorFieldSettings: { street: "HIDDEN" } }, "PATCH"), params);

    const data = mockPrisma.givingLink.update.mock.calls[0][0].data;
    expect(data.collectMailingAddress).toBe(true);
    expect(data.donorFieldSettingsJson.street).toBe("REQUIRED");
  });

  it("applies the rule to an unrelated edit too, so an older link that skipped the address gets fixed on its next save", async () => {
    mockPrisma.church.findUnique.mockResolvedValue({ requireDonorAddress: true });
    const { PATCH } = await loadUpdate();

    await PATCH(req({ publicTitle: "New title" }, "PATCH"), params);

    const data = mockPrisma.givingLink.update.mock.calls[0][0].data;
    expect(data.collectMailingAddress).toBe(true);
    expect(data.donorFieldSettingsJson.street).toBe("REQUIRED");
  });

  it("does not touch the address settings when the organization rule is off", async () => {
    mockPrisma.church.findUnique.mockResolvedValue({ requireDonorAddress: false });
    const { PATCH } = await loadUpdate();

    await PATCH(req({ publicTitle: "New title" }, "PATCH"), params);

    const data = mockPrisma.givingLink.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("collectMailingAddress");
    expect(data).not.toHaveProperty("donorFieldSettingsJson");
  });
});
