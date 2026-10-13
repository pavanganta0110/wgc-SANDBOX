import { prisma } from "@/lib/prisma";
import { evaluateGivingReadiness, type GivingReadiness } from "./givingTypes";

/**
 * Stored (no-network) view of a church's Planning Center Giving setup. The
 * sync engine in a later phase calls computeStoredGivingReadiness on every
 * run; it must stay cheap and never touch Planning Center.
 */

export async function getSyncConfig(churchId: string) {
  return prisma.planningCenterSyncConfig.findUnique({ where: { churchId } });
}

/** Creates the config row on first use, bound to the connection's Planning Center organization. */
export async function ensureSyncConfig(churchId: string, pcoOrganizationId: string) {
  const existing = await prisma.planningCenterSyncConfig.findUnique({ where: { churchId } });
  if (existing) return existing;
  return prisma.planningCenterSyncConfig.create({ data: { churchId, pcoOrganizationId } });
}

/**
 * Called when a church reconnects. If it is now connected to a DIFFERENT
 * Planning Center organization, everything chosen against the old one (the
 * payment source, default fund, every fund mapping) is meaningless — those ids
 * belong to another account — so it is cleared and `syncVersion` is bumped so
 * no record from the old account can ever be mistaken for the new one.
 * Reconnecting to the SAME organization leaves the setup alone.
 * Returns true when a reset happened.
 */
export async function resetGivingSetupIfOrganizationChanged(churchId: string, newOrganizationId: string): Promise<boolean> {
  const config = await prisma.planningCenterSyncConfig.findUnique({ where: { churchId } });
  if (!config || config.pcoOrganizationId === newOrganizationId) return false;

  await prisma.$transaction([
    prisma.planningCenterFundMapping.deleteMany({ where: { churchId } }),
    prisma.planningCenterSyncConfig.update({
      where: { churchId },
      data: {
        pcoOrganizationId: newOrganizationId,
        pcoPaymentSourceId: null,
        pcoPaymentSourceName: null,
        paymentSourceReadyAt: null,
        defaultPcoFundId: null,
        defaultPcoFundName: null,
        syncVersion: { increment: 1 },
      },
    }),
  ]);
  return true;
}

/**
 * Readiness from stored data only. A mapping is assumed healthy here (it was
 * validated live when saved); the setup screen re-validates against Planning
 * Center on every load, and the sync engine re-checks each fund when it builds
 * a payload, so a fund deleted later is caught as a per-gift problem rather
 * than silently routed elsewhere.
 */
export async function computeStoredGivingReadiness(churchId: string): Promise<GivingReadiness> {
  const [connection, config, funds, mappings] = await Promise.all([
    prisma.planningCenterConnection.findUnique({ where: { churchId } }),
    prisma.planningCenterSyncConfig.findUnique({ where: { churchId } }),
    prisma.fund.findMany({ where: { churchId, isActive: true }, select: { id: true, name: true }, orderBy: { displayOrder: "asc" } }),
    prisma.planningCenterFundMapping.findMany({ where: { churchId } }),
  ]);

  const mappingByFund = new Map(mappings.map((m) => [m.fundId, m]));
  return evaluateGivingReadiness({
    connectionHealthy: connection?.status === "CONNECTED",
    organizationMatches: Boolean(connection?.pcoOrganizationId && config && config.pcoOrganizationId === connection.pcoOrganizationId),
    canReadGiving: connection?.canReadGiving ?? null,
    canWriteGiving: connection?.canWriteGiving ?? null,
    paymentSource: config?.pcoPaymentSourceId ? "READY" : "MISSING",
    defaultFund: config?.defaultPcoFundId ? { name: config.defaultPcoFundName ?? "default fund", health: "OK" } : null,
    funds: funds.map((f) => ({ name: f.name, mapping: mappingByFund.has(f.id) ? { health: "OK" as const } : null })),
  });
}
