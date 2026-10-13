/* eslint-disable @typescript-eslint/no-explicit-any -- loose in-memory fake of one Prisma row */
import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

process.env.PLANNING_CENTER_CREDENTIAL_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");

type Row = Record<string, any>;
type Args = { where: Record<string, any>; data?: Row; create?: Row };
let row: Row | null;

const findUnique = vi.fn(async (args: Args) => {
  if (args.where.churchId) return row && row.churchId === args.where.churchId ? { ...row } : null;
  if (args.where.pcoOrganizationId) return row && row.pcoOrganizationId === args.where.pcoOrganizationId ? { ...row } : null;
  return null;
});
const findMany = vi.fn(async () => (row ? [{ churchId: row.churchId }] : []));
const updateMany = vi.fn(async (args: Args) => {
  if (!row) return { count: 0 };
  const w = args.where;
  if (w.id && w.id !== row.id) return { count: 0 };
  if (w.refreshTokenEncrypted && w.refreshTokenEncrypted !== row.refreshTokenEncrypted) return { count: 0 };
  Object.assign(row, args.data);
  return { count: 1 };
});
const upsert = vi.fn(async (args: Args) => {
  row = { id: "conn1", ...(row ?? {}), ...args.create };
  return { ...row };
});
const update = vi.fn(async (args: Args) => {
  Object.assign(row!, args.data);
  return { ...row };
});

vi.mock("@/lib/prisma", () => ({
  prisma: { planningCenterConnection: { findUnique: (a: Args) => findUnique(a), findMany: () => findMany(), updateMany: (a: Args) => updateMany(a), upsert: (a: Args) => upsert(a), update: (a: Args) => update(a) } },
}));
const mockAudit = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {});
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: (...a: unknown[]) => mockAudit(...a) }));
const mockResetSetup = vi.fn<(churchId: string, orgId: string) => Promise<boolean>>(async () => false);
vi.mock("../syncConfig", () => ({ resetGivingSetupIfOrganizationChanged: (c: string, o: string) => mockResetSetup(c, o) }));

const mockRefresh = vi.fn();
const mockExchange = vi.fn();
const mockRevoke = vi.fn<(...args: unknown[]) => Promise<boolean>>(async () => true);
vi.mock("../authProvider", async () => {
  const actual = await vi.importActual<typeof import("../authProvider")>("../authProvider");
  return { ...actual, refreshAccessToken: (...a: unknown[]) => mockRefresh(...a), exchangeAuthorizationCode: (...a: unknown[]) => mockExchange(...a), revokeToken: (...a: unknown[]) => mockRevoke(...a) };
});

const mockIdentity = vi.fn();
const mockProbe = vi.fn();
vi.mock("../resourceClient", async () => {
  const actual = await vi.importActual<typeof import("../resourceClient")>("../resourceClient");
  return { ...actual, fetchPlanningCenterIdentity: (...a: unknown[]) => mockIdentity(...a), probeGivingAccess: (...a: unknown[]) => mockProbe(...a) };
});

import { encryptPlanningCenterTokens } from "../credentials";
import { PlanningCenterAuthError, PlanningCenterApiError } from "../errors";
import {
  completePlanningCenterConnection,
  disconnectPlanningCenter,
  getAccessTokenForChurch,
  refreshExpiringConnections,
  testExistingPlanningCenterConnection,
} from "../service";

function connectedRow(overrides: Row = {}): Row {
  const enc = encryptPlanningCenterTokens("old-access", "old-refresh");
  return {
    id: "conn1",
    churchId: "church1",
    status: "CONNECTED",
    pcoOrganizationId: "127",
    ...enc,
    tokenExpiresAt: new Date(Date.now() + 3600_000),
    refreshTokenExpiresAt: new Date(Date.now() + 80 * 86400_000),
    ...overrides,
  };
}

const newTokens = () => ({
  accessToken: "new-access",
  refreshToken: "new-refresh",
  accessTokenExpiresAt: new Date(Date.now() + 7200_000),
  refreshTokenExpiresAt: new Date(Date.now() + 90 * 86400_000),
  scopes: "giving people",
});

beforeEach(() => {
  row = null;
  vi.clearAllMocks();
});

describe("getAccessTokenForChurch", () => {
  it("returns the stored token without a network call while it's fresh", async () => {
    row = connectedRow();
    await expect(getAccessTokenForChurch("church1")).resolves.toBe("old-access");
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("refreshes an expired token and persists the ROTATED refresh token", async () => {
    row = connectedRow({ tokenExpiresAt: new Date(Date.now() - 1000) });
    mockRefresh.mockResolvedValue(newTokens());
    await expect(getAccessTokenForChurch("church1")).resolves.toBe("new-access");
    expect(mockRefresh).toHaveBeenCalledWith("old-refresh");
    // stored refresh token must now decrypt to the new one
    const { decryptPlanningCenterRefreshToken } = await import("../credentials");
    expect(decryptPlanningCenterRefreshToken({ refreshTokenEncrypted: row!.refreshTokenEncrypted, encryptionKeyFingerprint: row!.encryptionKeyFingerprint })).toBe("new-refresh");
  });

  it("lost compare-and-swap: adopts the winner's token instead of overwriting it", async () => {
    row = connectedRow({ tokenExpiresAt: new Date(Date.now() - 1000) });
    // While our refresh is in flight, another instance rotates the row.
    mockRefresh.mockImplementation(async () => {
      const winner = encryptPlanningCenterTokens("winner-access", "winner-refresh");
      Object.assign(row!, winner, { tokenExpiresAt: new Date(Date.now() + 7200_000) });
      return newTokens();
    });
    await expect(getAccessTokenForChurch("church1")).resolves.toBe("winner-access");
    const { decryptPlanningCenterRefreshToken } = await import("../credentials");
    expect(decryptPlanningCenterRefreshToken({ refreshTokenEncrypted: row!.refreshTokenEncrypted, encryptionKeyFingerprint: row!.encryptionKeyFingerprint })).toBe("winner-refresh");
  });

  it("invalid_grant because another instance already rotated: uses theirs, does NOT disconnect", async () => {
    row = connectedRow({ tokenExpiresAt: new Date(Date.now() - 1000) });
    mockRefresh.mockImplementation(async () => {
      const winner = encryptPlanningCenterTokens("winner-access", "winner-refresh");
      Object.assign(row!, winner, { tokenExpiresAt: new Date(Date.now() + 7200_000) });
      throw new PlanningCenterAuthError({ category: "INVALID_GRANT", retryable: false, safeMessage: "dead" });
    });
    await expect(getAccessTokenForChurch("church1")).resolves.toBe("winner-access");
    expect(row!.status).toBe("CONNECTED");
  });

  it("genuine invalid_grant: marks REAUTHENTICATION_REQUIRED and throws", async () => {
    row = connectedRow({ tokenExpiresAt: new Date(Date.now() - 1000) });
    mockRefresh.mockRejectedValue(new PlanningCenterAuthError({ category: "INVALID_GRANT", retryable: false, safeMessage: "dead" }));
    await expect(getAccessTokenForChurch("church1")).rejects.toBeInstanceOf(PlanningCenterAuthError);
    expect(row!.status).toBe("REAUTHENTICATION_REQUIRED");
    expect(row!.lastErrorCode).toBe("INVALID_GRANT");
    // And later calls refuse without hitting Planning Center again.
    mockRefresh.mockClear();
    await expect(getAccessTokenForChurch("church1")).rejects.toThrow(/reconnected/);
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("a transient refresh failure does not disconnect the church", async () => {
    row = connectedRow({ tokenExpiresAt: new Date(Date.now() - 1000) });
    mockRefresh.mockRejectedValue(new PlanningCenterAuthError({ category: "TEMPORARY_PLANNING_CENTER_ERROR", retryable: true, safeMessage: "down" }));
    await expect(getAccessTokenForChurch("church1")).rejects.toBeInstanceOf(PlanningCenterAuthError);
    expect(row!.status).toBe("CONNECTED");
  });

  it("refuses when there is no connection or it was disconnected", async () => {
    await expect(getAccessTokenForChurch("church1")).rejects.toThrow(/no Planning Center connection/);
    row = connectedRow({ status: "DISCONNECTED" });
    await expect(getAccessTokenForChurch("church1")).rejects.toThrow(/reconnected/);
  });

  it("force refreshes even when the access token is still valid", async () => {
    row = connectedRow();
    mockRefresh.mockResolvedValue(newTokens());
    await expect(getAccessTokenForChurch("church1", { force: true })).resolves.toBe("new-access");
  });
});

describe("completePlanningCenterConnection", () => {
  const params = { churchId: "church1", code: "c", codeVerifier: "v", actorUserId: "u1" };

  beforeEach(() => {
    mockExchange.mockResolvedValue(newTokens());
    mockIdentity.mockResolvedValue({ organizationId: "127", organizationName: "Test Church", userId: "9", userName: "Pat" });
    mockProbe.mockResolvedValue(true);
  });

  it("verifies against Planning Center, then stores encrypted tokens", async () => {
    const conn = await completePlanningCenterConnection(params);
    expect(conn.status).toBe("CONNECTED");
    expect(row!.pcoOrganizationId).toBe("127");
    expect(row!.canReadGiving).toBe(true);
    expect(row!.canWriteGiving).toBeNull();
    expect(row!.accessTokenEncrypted).not.toContain("new-access");
    expect(mockRevoke).not.toHaveBeenCalled();
  });

  it("clears the Giving setup when the church reconnects to a DIFFERENT Planning Center organization, and says so in the audit log", async () => {
    mockResetSetup.mockResolvedValueOnce(true);
    await completePlanningCenterConnection(params);
    expect(mockResetSetup).toHaveBeenCalledWith("church1", "127");
    expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ givingSetupReset: true }) }));
  });

  it("does not touch the Giving setup when a connection is refused", async () => {
    row = connectedRow({ churchId: "other-church" });
    await expect(completePlanningCenterConnection(params)).rejects.toThrow(/already connected/);
    expect(mockResetSetup).not.toHaveBeenCalled();
  });

  it("connects but records canReadGiving=false when Giving access is missing", async () => {
    mockProbe.mockResolvedValue(false);
    await completePlanningCenterConnection(params);
    expect(row!.status).toBe("CONNECTED");
    expect(row!.canReadGiving).toBe(false);
  });

  it("refuses an organization already linked to another church, stores nothing, and revokes the grant", async () => {
    row = connectedRow({ churchId: "other-church" });
    await expect(completePlanningCenterConnection(params)).rejects.toThrow(/already connected to a different WGC organization/);
    expect(upsert).not.toHaveBeenCalled();
    expect(mockRevoke).toHaveBeenCalledWith("new-refresh", "refresh_token");
  });

  it("abandons (and revokes) when Planning Center rejects the identity call", async () => {
    mockIdentity.mockRejectedValue(new PlanningCenterApiError({ category: "ACCESS_DENIED", retryable: false, safeMessage: "no" }, 403));
    await expect(completePlanningCenterConnection(params)).rejects.toThrow(/access to People/);
    expect(upsert).not.toHaveBeenCalled();
    expect(mockRevoke).toHaveBeenCalled();
  });
});

describe("disconnectPlanningCenter", () => {
  it("revokes best-effort, clears tokens and the org link, keeps the row", async () => {
    row = connectedRow();
    const conn = await disconnectPlanningCenter({ churchId: "church1", actorUserId: "u1" });
    expect(mockRevoke).toHaveBeenCalledWith("old-refresh", "refresh_token");
    expect(conn.status).toBe("DISCONNECTED");
    expect(row!.accessTokenEncrypted).toBeNull();
    expect(row!.refreshTokenEncrypted).toBeNull();
    expect(row!.pcoOrganizationId).toBeNull();
  });

  it("still disconnects when revocation throws", async () => {
    row = connectedRow();
    mockRevoke.mockRejectedValueOnce(new Error("pco down"));
    const conn = await disconnectPlanningCenter({ churchId: "church1", actorUserId: "u1" });
    expect(conn.status).toBe("DISCONNECTED");
  });
});

describe("testExistingPlanningCenterConnection", () => {
  it("reports a Giving-access warning without failing", async () => {
    row = connectedRow();
    mockIdentity.mockResolvedValue({ organizationId: "127", organizationName: "Test Church", userId: "9", userName: "Pat" });
    mockProbe.mockResolvedValue(false);
    const result = await testExistingPlanningCenterConnection("church1");
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/can't access Giving/);
    expect(row!.canReadGiving).toBe(false);
  });

  it("marks REAUTHENTICATION_REQUIRED on a 401", async () => {
    row = connectedRow();
    mockIdentity.mockRejectedValue(new PlanningCenterApiError({ category: "AUTHENTICATION_REQUIRED", retryable: false, safeMessage: "expired" }, 401));
    const result = await testExistingPlanningCenterConnection("church1");
    expect(result.ok).toBe(false);
    expect(row!.status).toBe("REAUTHENTICATION_REQUIRED");
  });
});

describe("refreshExpiringConnections", () => {
  it("force-refreshes due connections and isolates per-church failures", async () => {
    row = connectedRow();
    mockRefresh.mockResolvedValue(newTokens());
    await expect(refreshExpiringConnections()).resolves.toEqual({ checked: 1, refreshed: 1, failed: 0 });

    mockRefresh.mockRejectedValue(new PlanningCenterAuthError({ category: "TEMPORARY_PLANNING_CENTER_ERROR", retryable: true, safeMessage: "down" }));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(refreshExpiringConnections()).resolves.toEqual({ checked: 1, refreshed: 0, failed: 1 });
    errSpy.mockRestore();
  });
});
