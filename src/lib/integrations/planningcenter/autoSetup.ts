import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { isPlanningCenterSyncEnabled } from "./config";
import { getClientForChurch } from "./service";
import { applySuggestedMappings, createPlanningCenterFund, ensurePaymentSource, setDefaultFund, type Actor } from "./givingSetup";
import { isFundUsable, listFunds } from "./givingApi";
import { computeStoredGivingReadiness } from "./syncConfig";
import { PlanningCenterSetupError } from "./errors";

/**
 * "Connect, and that's all." After a church connects Planning Center for the FIRST time (or to a different
 * Planning Center organization), WGC sets up everything the sync needs and turns it on:
 *
 *   1. the "WGC Payments" payment source (which also proves the connected user can write to Giving)
 *   2. a default fund: Planning Center's own default
 *   3. fund matching: exact names are matched, and any WGC fund Planning Center doesn't have is created there
 *      (hidden from the church's own donation form)
 *   4. sync on, "as soon as it's paid", donors matched later (never held back, never a duplicate person)
 *
 * It never overwrites a choice a church already made: it only runs when the Giving setup was never completed for
 * this Planning Center organization, and it fills only what is missing. If any step fails it stops, leaves sync OFF,
 * and the church sees exactly what's left on the Giving setup panel. Gifts sent before this moment are never sent.
 */

export interface AutoSetupResult {
  ran: boolean;
  /** Why it didn't run, or what stopped it. */
  reason?: string;
  enabled: boolean;
  createdFunds: number;
  matchedFunds: number;
}

const none = (reason: string): AutoSetupResult => ({ ran: false, reason, enabled: false, createdFunds: 0, matchedFunds: 0 });

export async function autoSetupAfterConnect(churchId: string, actor: Actor, now: Date = new Date()): Promise<AutoSetupResult> {
  // Nothing is created in a church's Planning Center unless gift sync is available platform-wide.
  if (!isPlanningCenterSyncEnabled()) return none("Gift sync isn't switched on for WGC yet.");

  const existing = await prisma.planningCenterSyncConfig.findUnique({ where: { churchId } });
  // Already set up for this organization (or the church set it up themselves): leave their choices alone.
  if (existing?.pcoPaymentSourceId) return none("This church already finished the Giving setup.");

  const result: AutoSetupResult = { ran: true, enabled: false, createdFunds: 0, matchedFunds: 0 };
  try {
    await ensurePaymentSource(churchId, actor);

    // Default fund: only if the church hasn't chosen one.
    const afterSource = await prisma.planningCenterSyncConfig.findUnique({ where: { churchId } });
    if (!afterSource?.defaultPcoFundId) {
      const client = await getClientForChurch(churchId);
      const funds = (await listFunds(client)).filter(isFundUsable);
      const fallback = funds.find((f) => f.isDefault) ?? funds[0];
      if (!fallback) throw new PlanningCenterSetupError("This Planning Center organization has no fund gifts can be recorded in.");
      await setDefaultFund(churchId, fallback.id, actor);
    }

    const matched = await applySuggestedMappings(churchId, actor);
    result.matchedFunds = matched.mapped;

    // Any active WGC fund still unmapped has no namesake in Planning Center: create it there (hidden from donors).
    const [wgcFunds, mappings] = await Promise.all([
      prisma.fund.findMany({ where: { churchId, isActive: true }, select: { id: true } }),
      prisma.planningCenterFundMapping.findMany({ where: { churchId }, select: { fundId: true } }),
    ]);
    const mapped = new Set(mappings.map((m) => m.fundId));
    for (const fund of wgcFunds.filter((f) => !mapped.has(f.id))) {
      try {
        await createPlanningCenterFund(churchId, fund.id, actor);
        result.createdFunds++;
      } catch (err) {
        // A name collision means a fund exists after all (made while we worked): it's picked up as a suggestion later.
        if (!(err instanceof PlanningCenterSetupError)) throw err;
      }
    }

    // Turn it on only if everything the sync needs is really in place.
    const readiness = await computeStoredGivingReadiness(churchId);
    if (!readiness.ready) return { ...result, reason: readiness.reasons[0] };
    await prisma.planningCenterSyncConfig.update({
      where: { churchId },
      data: { syncMode: "LIVE", sendTiming: "ON_PAYMENT", unmatchedDonorPolicy: "ATTACH_LATER", autoCommitBatches: false, enabledAt: now },
    });
    result.enabled = true;
  } catch (err) {
    result.reason = err instanceof Error ? err.message : "The setup couldn't be completed.";
  }

  await logDashboardAction({
    churchId,
    actorUserId: actor.userId,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: "planningcenter.auto_setup",
    entityType: "PlanningCenterSyncConfig",
    entityId: churchId,
    metadata: { enabled: result.enabled, createdFunds: result.createdFunds, matchedFunds: result.matchedFunds, stoppedBecause: result.reason ?? null },
    req: actor.req,
  });
  return result;
}
