import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSendWgcEmail = vi.fn();
vi.mock("@/lib/email", () => ({ sendWgcEmail: (opts: unknown) => mockSendWgcEmail(opts) }));

const mockPrisma: any = {
  church: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  emailLog: { create: vi.fn().mockResolvedValue(undefined) },
  // provisionChurchAccount wraps the existingUser check + create/update in
  // pg_try_advisory_xact_lock via $transaction — the mock transaction just
  // hands the same mockPrisma back as `tx` so existing assertions on
  // mockPrisma.user.* still see the calls made inside the callback, and
  // $queryRaw always reports the lock as acquired (single-caller tests).
  $transaction: vi.fn((fn: any) => fn(mockPrisma)),
  $queryRaw: vi.fn().mockResolvedValue([{ locked: true }]),
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

async function load() {
  vi.resetModules();
  return import("@/lib/auth/provisionChurchAccount");
}

function baseApp(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "app-1",
    organizationName: "Test Org",
    legalBusinessName: null,
    contactEmail: "merchant@example.com",
    contactName: "Merchant Person",
    finixMerchantId: "MU1",
    finixIdentityId: "ID1",
    finixApplicationId: "AP1",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.church.findFirst.mockResolvedValue(null);
  mockPrisma.church.findUnique.mockResolvedValue(null);
  mockPrisma.church.create.mockResolvedValue({ id: "church-1" });
  mockPrisma.user.findUnique.mockResolvedValue(null);
  mockPrisma.user.create.mockResolvedValue({ id: "user-1", email: "merchant@example.com", churchId: "church-1" });
  mockSendWgcEmail.mockResolvedValue({ success: true, data: { id: "email-1" } });
});

describe("provisionChurchAccount", () => {
  it("creates a User (with its name backfilled from OnboardingApplication.contactName) and sends the dashboard-access email when no account exists yet", async () => {
    const { provisionChurchAccount } = await load();
    const result = await provisionChurchAccount(baseApp());

    expect(mockPrisma.user.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ name: "Merchant Person" }) }));
    expect(mockSendWgcEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "merchant@example.com" }));
    expect(result.emailSent).toBe(true);
  });

  it("grants the org's first-ever user role \"owner\" and sets Church.primaryOwnerUserId — a church with no owner used to deadlock every merchant that hit it: activation and team-role editing both require role owner, and nothing could ever grant it", async () => {
    mockPrisma.church.create.mockResolvedValue({ id: "church-1", primaryOwnerUserId: null });
    const { provisionChurchAccount } = await load();
    await provisionChurchAccount(baseApp());

    expect(mockPrisma.user.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ role: "owner" }) }));
    expect(mockPrisma.church.update).toHaveBeenCalledWith({ where: { id: "church-1" }, data: { primaryOwnerUserId: "user-1" } });
  });

  it("keeps role \"church_admin\" and never touches Church.primaryOwnerUserId when the church already has an owner", async () => {
    mockPrisma.church.create.mockResolvedValue({ id: "church-1", primaryOwnerUserId: "existing-owner" });
    const { provisionChurchAccount } = await load();
    await provisionChurchAccount(baseApp());

    expect(mockPrisma.user.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ role: "church_admin" }) }));
    expect(mockPrisma.church.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ primaryOwnerUserId: expect.anything() }) }));
  });

  it("logs a SENT EmailLog entry of type DASHBOARD_ACCESS on success — previously this send was never logged at all", async () => {
    const { provisionChurchAccount } = await load();
    await provisionChurchAccount(baseApp());
    expect(mockPrisma.emailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "DASHBOARD_ACCESS", to: "merchant@example.com", status: "SENT" }) })
    );
  });

  it("logs an ERROR EmailLog entry when the send fails, instead of leaving no trace", async () => {
    mockSendWgcEmail.mockResolvedValue({ success: false, error: "resend down" });
    const { provisionChurchAccount } = await load();
    const result = await provisionChurchAccount(baseApp());
    expect(result.emailSent).toBe(false);
    expect(mockPrisma.emailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "ERROR", error: "resend down" }) })
    );
  });

  it("never re-sends once the merchant has already set a password — a real completed account with a name already set is left alone entirely", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "merchant@example.com",
      churchId: "church-1",
      name: "Already Set Name",
      passwordHash: "hashed",
      lastLoginAt: null,
    });
    const { provisionChurchAccount } = await load();
    const result = await provisionChurchAccount(baseApp());

    expect(mockSendWgcEmail).not.toHaveBeenCalled();
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    expect(result.emailSent).toBe(false);
  });

  it("backfills the owner's name (from OnboardingApplication.contactName) onto an already-completed account that's missing one — the fix for the admin Merchants Directory showing \"Unnamed owner\" — but still never re-sends the invite email or touches password/login state", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "merchant@example.com",
      churchId: "church-1",
      name: null,
      passwordHash: "hashed",
      lastLoginAt: null,
    });
    mockPrisma.user.update.mockResolvedValue({ id: "user-1", name: "Merchant Person" });
    const { provisionChurchAccount } = await load();
    const result = await provisionChurchAccount(baseApp());

    expect(mockSendWgcEmail).not.toHaveBeenCalled();
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: "user-1" }, data: { name: "Merchant Person" } });
    expect(result.emailSent).toBe(false);
  });

  it("never re-sends once the merchant has already logged in", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "merchant@example.com",
      churchId: "church-1",
      passwordHash: null,
      lastLoginAt: new Date(),
    });
    const { provisionChurchAccount } = await load();
    await provisionChurchAccount(baseApp());
    expect(mockSendWgcEmail).not.toHaveBeenCalled();
  });

  it("retries the email for a User row that exists but never completed setup — this is the exact stranded-merchant bug: a prior send failure left a User row with no password and no login, and every webhook retry used to bail out here without ever trying again", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "merchant@example.com",
      churchId: "church-1",
      passwordHash: null,
      lastLoginAt: null,
    });
    mockPrisma.user.update.mockResolvedValue({ id: "user-1", email: "merchant@example.com", churchId: "church-1" });

    const { provisionChurchAccount } = await load();
    const result = await provisionChurchAccount(baseApp());

    expect(mockPrisma.user.create).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "user-1" }, data: expect.objectContaining({ setPasswordTokenHash: expect.any(String) }) })
    );
    expect(mockSendWgcEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "merchant@example.com" }));
    expect(result.emailSent).toBe(true);
  });

  it("re-links an already-completed account to the current church without touching its password/email state, and preserves an existing name rather than overwriting it", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "merchant@example.com",
      churchId: "different-church",
      name: "Existing Real Name",
      passwordHash: "hashed",
      lastLoginAt: null,
    });
    const { provisionChurchAccount } = await load();
    await provisionChurchAccount(baseApp());
    expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: "user-1" }, data: { churchId: "church-1" } });
  });

  it("re-links to the current church AND backfills a missing name in the same update when both are needed", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "merchant@example.com",
      churchId: "different-church",
      name: null,
      passwordHash: "hashed",
      lastLoginAt: null,
    });
    const { provisionChurchAccount } = await load();
    await provisionChurchAccount(baseApp());
    expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: "user-1" }, data: { churchId: "church-1", name: "Merchant Person" } });
  });

  it("never re-sends when a still-valid, unexpired invite was already issued — the actual production bug: two Finix events for the same merchant landing seconds (not milliseconds) apart, past the advisory lock's transaction-scoped window, each saw no passwordHash/lastLoginAt and sent a second DASHBOARD_ACCESS email", async () => {
    const notExpired = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000);
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "merchant@example.com",
      churchId: "church-1",
      name: "Merchant Person",
      passwordHash: null,
      lastLoginAt: null,
      setPasswordTokenHash: "already-issued-hash",
      setPasswordTokenExpiresAt: notExpired,
    });
    const { provisionChurchAccount } = await load();
    const result = await provisionChurchAccount(baseApp());

    expect(mockSendWgcEmail).not.toHaveBeenCalled();
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    expect(result.emailSent).toBe(false);
  });

  it("still retries once a previously-issued invite has actually expired", async () => {
    const expired = new Date(Date.now() - 60 * 1000);
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "merchant@example.com",
      churchId: "church-1",
      name: "Merchant Person",
      passwordHash: null,
      lastLoginAt: null,
      setPasswordTokenHash: "stale-hash",
      setPasswordTokenExpiresAt: expired,
    });
    mockPrisma.user.update.mockResolvedValue({ id: "user-1", email: "merchant@example.com", churchId: "church-1" });

    const { provisionChurchAccount } = await load();
    const result = await provisionChurchAccount(baseApp());

    expect(mockSendWgcEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "merchant@example.com" }));
    expect(result.emailSent).toBe(true);
  });

  it("skips sending entirely when a concurrent call already holds the advisory lock — the exact bug seen in production: two different Finix webhook events for the same merchant landing milliseconds apart both sent the DASHBOARD_ACCESS email", async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ locked: false }]);
    const { provisionChurchAccount } = await load();
    const result = await provisionChurchAccount(baseApp());

    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
    expect(mockSendWgcEmail).not.toHaveBeenCalled();
    expect(result.emailSent).toBe(false);
    expect(result.user).toBeNull();
  });
});
