import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    aplosConnection: { findUnique: vi.fn() },
    aplosAccountConfiguration: { findUnique: vi.fn() },
    fund: { count: vi.fn() },
    aplosPurposeMapping: { count: vi.fn() },
  },
}));

describe("computeSyncEligibility", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is ineligible when not connected", async () => {
    const { computeSyncEligibility } = await import("../syncEligibility");
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.aplosAccountConfiguration.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.fund.count).mockResolvedValue(0);
    vi.mocked(prisma.aplosPurposeMapping.count).mockResolvedValue(0);

    const result = await computeSyncEligibility("church-1");
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => r.includes("not connected"))).toBe(true);
  });

  it("is ineligible when account configuration is missing", async () => {
    const { computeSyncEligibility } = await import("../syncEligibility");
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue({ status: "CONNECTED" } as never);
    vi.mocked(prisma.aplosAccountConfiguration.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.fund.count).mockResolvedValue(0);
    vi.mocked(prisma.aplosPurposeMapping.count).mockResolvedValue(0);

    const result = await computeSyncEligibility("church-1");
    expect(result.eligible).toBe(false);
  });

  it("is ineligible when a fund is unmapped and no default purpose exists", async () => {
    const { computeSyncEligibility } = await import("../syncEligibility");
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue({ status: "CONNECTED", lastErrorAt: null, lastConnectionTestAt: null } as never);
    vi.mocked(prisma.aplosAccountConfiguration.findUnique).mockResolvedValue({ defaultPurposeId: null } as never);
    vi.mocked(prisma.fund.count).mockResolvedValue(3);
    vi.mocked(prisma.aplosPurposeMapping.count).mockResolvedValue(1);

    const result = await computeSyncEligibility("church-1");
    expect(result.eligible).toBe(false);
  });

  it("is eligible when every fund is mapped, even without a default purpose", async () => {
    const { computeSyncEligibility } = await import("../syncEligibility");
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue({ status: "CONNECTED", lastErrorAt: null, lastConnectionTestAt: null } as never);
    vi.mocked(prisma.aplosAccountConfiguration.findUnique).mockResolvedValue({ defaultPurposeId: null } as never);
    vi.mocked(prisma.fund.count).mockResolvedValue(2);
    vi.mocked(prisma.aplosPurposeMapping.count).mockResolvedValue(2);

    const result = await computeSyncEligibility("church-1");
    expect(result.eligible).toBe(true);
  });

  it("is eligible when a default purpose exists, even with fewer mappings than funds", async () => {
    const { computeSyncEligibility } = await import("../syncEligibility");
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue({ status: "CONNECTED", lastErrorAt: null, lastConnectionTestAt: null } as never);
    vi.mocked(prisma.aplosAccountConfiguration.findUnique).mockResolvedValue({ defaultPurposeId: "5" } as never);
    vi.mocked(prisma.fund.count).mockResolvedValue(5);
    vi.mocked(prisma.aplosPurposeMapping.count).mockResolvedValue(1);

    const result = await computeSyncEligibility("church-1");
    expect(result.eligible).toBe(true);
  });

  it("is ineligible when the most recent activity was an error", async () => {
    const { computeSyncEligibility } = await import("../syncEligibility");
    const { prisma } = await import("@/lib/prisma");
    const now = new Date();
    const earlier = new Date(now.getTime() - 60_000);
    vi.mocked(prisma.aplosConnection.findUnique).mockResolvedValue({ status: "CONNECTED", lastErrorAt: now, lastConnectionTestAt: earlier } as never);
    vi.mocked(prisma.aplosAccountConfiguration.findUnique).mockResolvedValue({ defaultPurposeId: "1" } as never);
    vi.mocked(prisma.fund.count).mockResolvedValue(0);
    vi.mocked(prisma.aplosPurposeMapping.count).mockResolvedValue(0);

    const result = await computeSyncEligibility("church-1");
    expect(result.eligible).toBe(false);
  });
});
