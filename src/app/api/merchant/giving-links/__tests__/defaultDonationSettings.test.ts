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
  church: { findUnique: vi.fn().mockResolvedValue({ defaultCollectMailingAddressOnNewLinks: true }) },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

function owner() {
  return { userId: "user-1", email: "owner@church.org", churchId: "church-a", role: "owner", rawRole: "owner" };
}

function req(body: unknown, method = "POST") {
  return new Request("http://x", { method, body: JSON.stringify(body) });
}

function createBody(overrides: Record<string, unknown> = {}) {
  return {
    internalName: "Main Giving Form",
    publicTitle: "Give to Grace Church",
    amountType: "VARIABLE",
    suggestedAmountsCents: [2500, 5000, 10000],
    allowCustomAmount: true,
    recurringEnabled: true,
    allowedFrequencies: ["MONTHLY"],
    allowedPaymentMethods: ["CARD"],
    ...overrides,
  };
}

function existingLink(overrides: Record<string, unknown> = {}) {
  return {
    id: "link-1",
    churchId: "church-a",
    publicSlug: "give",
    ownerUserId: "user-1",
    amountType: "VARIABLE",
    minAmountCents: null,
    maxAmountCents: null,
    suggestedAmountsJson: [2500, 5000, 10000],
    allowCustomAmount: true,
    recurringEnabled: true,
    fundSelectionEnabled: false,
    defaultDonationType: "ONE_TIME",
    defaultRecurringAmountCents: null,
    brandingSettingsJson: null,
    ...overrides,
  };
}

async function loadCreate() {
  vi.resetModules();
  return import("../route");
}
async function loadUpdate() {
  vi.resetModules();
  return import("../[id]/route");
}
const params = { params: Promise.resolve({ id: "link-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(owner());
  mockPrisma.givingLink.findUnique.mockResolvedValue(null);
  mockPrisma.givingLink.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "new-link", ...data }));
  mockPrisma.givingLink.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...existingLink(), ...data }));
});

describe("POST /api/merchant/giving-links — default donation type / amount", () => {
  it("stores Recurring + $50 when the organization configures them", async () => {
    const { POST } = await loadCreate();
    const res = await POST(req(createBody({ defaultDonationType: "RECURRING", defaultRecurringAmountCents: 5000 })));
    expect(res.status).toBe(200);
    expect(mockPrisma.givingLink.create.mock.calls[0][0].data).toMatchObject({ defaultDonationType: "RECURRING", defaultRecurringAmountCents: 5000 });
  });

  it("a form created without the new settings is exactly as before: One-Time, no default amount", async () => {
    const { POST } = await loadCreate();
    const res = await POST(req(createBody()));
    expect(res.status).toBe(200);
    expect(mockPrisma.givingLink.create.mock.calls[0][0].data).toMatchObject({ defaultDonationType: "ONE_TIME", defaultRecurringAmountCents: null });
  });

  it("rejects Recurring as the default when recurring giving is off", async () => {
    const { POST } = await loadCreate();
    const res = await POST(req(createBody({ recurringEnabled: false, defaultDonationType: "RECURRING" })));
    expect(res.status).toBe(400);
    expect(mockPrisma.givingLink.create).not.toHaveBeenCalled();
  });

  it("rejects a default recurring amount under $1.00", async () => {
    const { POST } = await loadCreate();
    const res = await POST(req(createBody({ defaultDonationType: "RECURRING", defaultRecurringAmountCents: 50 })));
    expect(res.status).toBe(400);
    expect(mockPrisma.givingLink.create).not.toHaveBeenCalled();
  });

  it("rejects a default recurring amount outside the form's min/max", async () => {
    const { POST } = await loadCreate();
    const res = await POST(req(createBody({ defaultDonationType: "RECURRING", defaultRecurringAmountCents: 5000, maxAmountCents: 4000 })));
    expect(res.status).toBe(400);
  });

  it("ignores the default amount on a fixed-price form", async () => {
    const { POST } = await loadCreate();
    const res = await POST(req(createBody({ amountType: "FIXED", fixedAmountCents: 10000, defaultDonationType: "RECURRING", defaultRecurringAmountCents: 5000 })));
    expect(res.status).toBe(200);
    expect(mockPrisma.givingLink.create.mock.calls[0][0].data).toMatchObject({ defaultDonationType: "RECURRING", defaultRecurringAmountCents: null });
  });
});

describe("PATCH /api/merchant/giving-links/[id] — default donation type / amount", () => {
  it("saves Recurring + $50 on an existing form", async () => {
    mockPrisma.givingLink.findFirst.mockResolvedValue(existingLink());
    const { PATCH } = await loadUpdate();
    const res = await PATCH(req({ defaultDonationType: "RECURRING", defaultRecurringAmountCents: 5000 }, "PATCH"), params);
    expect(res.status).toBe(200);
    expect(mockPrisma.givingLink.update.mock.calls[0][0].data).toMatchObject({ defaultDonationType: "RECURRING", defaultRecurringAmountCents: 5000 });
  });

  it("leaves the stored defaults untouched on an unrelated edit", async () => {
    mockPrisma.givingLink.findFirst.mockResolvedValue(existingLink({ defaultDonationType: "RECURRING", defaultRecurringAmountCents: 5000 }));
    const { PATCH } = await loadUpdate();
    const res = await PATCH(req({ publicTitle: "New Title" }, "PATCH"), params);
    expect(res.status).toBe(200);
    const data = mockPrisma.givingLink.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("defaultDonationType");
    expect(data).not.toHaveProperty("defaultRecurringAmountCents");
  });

  it("blocks turning recurring off while Recurring is still the default", async () => {
    mockPrisma.givingLink.findFirst.mockResolvedValue(existingLink({ defaultDonationType: "RECURRING", defaultRecurringAmountCents: 5000 }));
    const { PATCH } = await loadUpdate();
    const res = await PATCH(req({ recurringEnabled: false }, "PATCH"), params);
    expect(res.status).toBe(400);
    expect(mockPrisma.givingLink.update).not.toHaveBeenCalled();
  });

  it("allows turning recurring off in the same save that switches the default back to One-Time, clearing the amount", async () => {
    mockPrisma.givingLink.findFirst.mockResolvedValue(existingLink({ defaultDonationType: "RECURRING", defaultRecurringAmountCents: 5000 }));
    const { PATCH } = await loadUpdate();
    const res = await PATCH(req({ recurringEnabled: false, defaultDonationType: "ONE_TIME", defaultRecurringAmountCents: null }, "PATCH"), params);
    expect(res.status).toBe(200);
    expect(mockPrisma.givingLink.update.mock.calls[0][0].data).toMatchObject({ defaultDonationType: "ONE_TIME", defaultRecurringAmountCents: null });
  });

  it("re-validates the stored default against changed suggested amounts when custom amounts are off", async () => {
    mockPrisma.givingLink.findFirst.mockResolvedValue(existingLink({ defaultDonationType: "RECURRING", defaultRecurringAmountCents: 5000 }));
    const { PATCH } = await loadUpdate();
    const res = await PATCH(req({ suggestedAmountsCents: [1000, 2000], allowCustomAmount: false }, "PATCH"), params);
    expect(res.status).toBe(400);
  });

  it("clears the stored default amount when the form switches to a fixed price", async () => {
    mockPrisma.givingLink.findFirst.mockResolvedValue(existingLink({ defaultDonationType: "RECURRING", defaultRecurringAmountCents: 5000 }));
    const { PATCH } = await loadUpdate();
    const res = await PATCH(req({ amountType: "FIXED", fixedAmountCents: 10000 }, "PATCH"), params);
    expect(res.status).toBe(200);
    expect(mockPrisma.givingLink.update.mock.calls[0][0].data).toMatchObject({ defaultDonationType: "RECURRING", defaultRecurringAmountCents: null });
  });

  it("rejects an invalid donation type", async () => {
    mockPrisma.givingLink.findFirst.mockResolvedValue(existingLink());
    const { PATCH } = await loadUpdate();
    const res = await PATCH(req({ defaultDonationType: "WEEKLY" }, "PATCH"), params);
    expect(res.status).toBe(400);
  });

  it("404s for a giving link in another organization (tenant isolation)", async () => {
    mockPrisma.givingLink.findFirst.mockResolvedValue(null);
    const { PATCH } = await loadUpdate();
    const res = await PATCH(req({ defaultDonationType: "RECURRING" }, "PATCH"), params);
    expect(res.status).toBe(404);
    expect(mockPrisma.givingLink.findFirst).toHaveBeenCalledWith({ where: { id: "link-1", churchId: "church-a" } });
  });
});
