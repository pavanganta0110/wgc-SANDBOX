import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  givingLink: { findUnique: vi.fn() },
  church: { findUnique: vi.fn() },
  churchPricing: { findUnique: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/payments/paymentMethodAvailability", () => ({
  getPaymentMethodAvailability: vi.fn().mockResolvedValue([
    { method: "APPLE_PAY", enabledForOrganization: true },
    { method: "GOOGLE_PAY", enabledForOrganization: false },
  ]),
}));

vi.mock("@/lib/giving/fundAssignment", () => ({
  loadAssignedActiveFunds: vi.fn().mockResolvedValue([{ fundId: "fund-1", name: "Missions", isDefault: true }]),
}));

async function loadModule() {
  vi.resetModules();
  return import("@/app/api/embed/giving-pages/[slug]/route");
}

function baseLink(overrides: Record<string, unknown> = {}) {
  return {
    id: "link-1",
    churchId: "church-a",
    publicSlug: "give-here",
    publicTitle: "Sunday Giving",
    description: "Support our ministry",
    status: "ACTIVE",
    amountType: "VARIABLE",
    fixedAmountCents: null,
    minAmountCents: null,
    maxAmountCents: null,
    allowCustomAmount: true,
    suggestedAmountsJson: [2500, 5000],
    recurringEnabled: true,
    allowedFrequenciesJson: ["MONTHLY"],
    allowedPaymentMethodsJson: ["CARD", "BANK", "APPLE_PAY"],
    feeCoverEnabled: true,
    feeCoverDefaultOn: false,
    donorFieldSettingsJson: null,
    brandingSettingsJson: null,
    fundSelectionEnabled: true,
    successfulDonations: 0,
    ...overrides,
  };
}

function baseChurch(overrides: Record<string, unknown> = {}) {
  return {
    id: "church-a",
    name: "Grace Church",
    logoUrl: "https://cdn.wgc.example/logo.png",
    finixMerchantId: "MU123",
    embedDomainRestrictionEnabled: false,
    embedAllowedDomainsJson: [],
    ...overrides,
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_FINIX_APPLICATION_ID = "APfoo123";
  process.env.NEXT_PUBLIC_FINIX_ENV = "sandbox";
  mockPrisma.churchPricing.findUnique.mockResolvedValue({ cardPercentageFee: 2.9, cardFixedFeeCents: 30, achFixedFeeCents: 5 });
  const { getPaymentMethodAvailability } = await import("@/lib/payments/paymentMethodAvailability");
  vi.mocked(getPaymentMethodAvailability).mockResolvedValue([
    { method: "APPLE_PAY", enabledForOrganization: true },
    { method: "GOOGLE_PAY", enabledForOrganization: false },
  ] as never);
});

function req(url = "http://localhost/api/embed/giving-pages/give-here", origin: string | null = null) {
  const headers = new Headers();
  if (origin) headers.set("origin", origin);
  return new Request(url, { headers });
}

describe("GET /api/embed/giving-pages/[slug] — public config", () => {
  it("404s for a slug that does not exist", async () => {
    mockPrisma.givingLink.findUnique.mockResolvedValue(null);
    const { GET } = await loadModule();
    const res = await GET(req(), { params: Promise.resolve({ slug: "nope" }) });
    expect(res.status).toBe(404);
  });

  it("returns a non-200 for an inactive giving page rather than exposing its config", async () => {
    mockPrisma.givingLink.findUnique.mockResolvedValue(baseLink({ status: "ARCHIVED" }));
    mockPrisma.church.findUnique.mockResolvedValue(baseChurch());
    const { GET } = await loadModule();
    const res = await GET(req(), { params: Promise.resolve({ slug: "give-here" }) });
    expect(res.status).not.toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  it("returns only safe public fields for an active, approved giving page", async () => {
    mockPrisma.givingLink.findUnique.mockResolvedValue(baseLink());
    mockPrisma.church.findUnique.mockResolvedValue(baseChurch());
    const { GET } = await loadModule();
    const res = await GET(req(), { params: Promise.resolve({ slug: "give-here" }) });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.organization.name).toBe("Grace Church");
    expect(body.givingPage.title).toBe("Sunday Giving");
    expect(body.funds.options).toEqual([{ id: "fund-1", name: "Missions", isDefault: true }]);
    expect(body.finix.applicationId).toBe("APfoo123");
    expect(body.finix.environment).toBe("sandbox");
    expect(body.finix.merchantId).toBe("MU123");

    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("church-a"); // internal church.id never leaks
    expect(body.merchantCredentials).toBeUndefined();
    expect(body.webhookSecret).toBeUndefined();
    expect(body.bankAccount).toBeUndefined();
  });

  it("allows a cross-origin request from any origin when the church has not restricted embed domains", async () => {
    mockPrisma.givingLink.findUnique.mockResolvedValue(baseLink());
    mockPrisma.church.findUnique.mockResolvedValue(baseChurch());
    const { GET } = await loadModule();
    const res = await GET(req(undefined, "https://random-merchant-site.com"), { params: Promise.resolve({ slug: "give-here" }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://random-merchant-site.com");
  });

  it("rejects a cross-origin request from a domain not on the allowlist when restriction is enabled", async () => {
    mockPrisma.givingLink.findUnique.mockResolvedValue(baseLink());
    mockPrisma.church.findUnique.mockResolvedValue(baseChurch({ embedDomainRestrictionEnabled: true, embedAllowedDomainsJson: ["church.org"] }));
    const { GET } = await loadModule();
    const res = await GET(req(undefined, "https://evil.example.com"), { params: Promise.resolve({ slug: "give-here" }) });
    expect(res.status).toBe(403);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("accepts a cross-origin request from an allowlisted domain when restriction is enabled", async () => {
    mockPrisma.givingLink.findUnique.mockResolvedValue(baseLink());
    mockPrisma.church.findUnique.mockResolvedValue(baseChurch({ embedDomainRestrictionEnabled: true, embedAllowedDomainsJson: ["church.org"] }));
    const { GET } = await loadModule();
    const res = await GET(req(undefined, "https://www.church.org"), { params: Promise.resolve({ slug: "give-here" }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://www.church.org");
  });

  it("handles OPTIONS preflight and responds with the same allowlist decision", async () => {
    mockPrisma.givingLink.findUnique.mockResolvedValue(baseLink());
    mockPrisma.church.findUnique.mockResolvedValue(baseChurch({ embedDomainRestrictionEnabled: true, embedAllowedDomainsJson: ["church.org"] }));
    const { OPTIONS } = await loadModule();
    const allowed = await OPTIONS(req(undefined, "https://www.church.org"), { params: Promise.resolve({ slug: "give-here" }) });
    expect(allowed.status).toBe(204);
    const rejected = await OPTIONS(req(undefined, "https://evil.example.com"), { params: Promise.resolve({ slug: "give-here" }) });
    expect(rejected.status).toBe(403);
  });
});
