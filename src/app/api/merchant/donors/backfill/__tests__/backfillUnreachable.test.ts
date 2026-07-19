import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => mockCookieStore) }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: vi.fn() } } }));
vi.mock("@/lib/donors/donorBackfill", () => ({
  backfillDonorNormalization: vi.fn(),
  backfillOrphanedPayments: vi.fn(),
  backfillTransferCreatedVia: vi.fn(),
}));

async function loadModule() {
  vi.resetModules();
  const sessionModule = await import("@/lib/auth/session");
  const route = await import("@/app/api/merchant/donors/backfill/route");
  return { ...route, createSessionToken: sessionModule.createSessionToken };
}

describe("CP4D: donors/backfill is confirmed unreachable by every role, not silently broken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SESSION_SECRET = "test-secret-at-least-32-characters-long";
  });

  it.each(["owner", "admin", "fundraiser", "viewer", "wgc_admin"] as const)("%s cannot trigger the backfill", async (role) => {
    const { POST, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    const { backfillDonorNormalization } = await import("@/lib/donors/donorBackfill");
    mockCookieStore.get.mockReturnValue({ value: createSessionToken({ userId: "u1", email: "u1@b.com", role, churchId: "church-a", authVersion: 1 }) });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "u1", email: "u1@b.com", churchId: "church-a", role, disabledAt: null, authVersion: 1, permissionsJson: null } as never);

    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({}) }));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(backfillDonorNormalization).not.toHaveBeenCalled();
  });
});
