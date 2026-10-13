import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { getClientForChurch } from "./service";
import { PlanningCenterApiError, PlanningCenterConnectionError, PlanningCenterSetupError } from "./errors";
import {
  PAYMENT_SOURCE_NAME,
  createFund,
  createPaymentSource,
  isFundUsable,
  listFunds,
  listPaymentSources,
  normalizeFundName,
  touchPaymentSource,
  type PcoFund,
  type PcoPaymentSource,
} from "./givingApi";
import { ensureSyncConfig } from "./syncConfig";
import {
  evaluateGivingReadiness,
  type GivingSetupFundRow,
  type GivingSetupState,
  type MappingHealth,
  type PcoGivingAccess,
} from "./givingTypes";
import type { PlanningCenterClient } from "./resourceClient";

/**
 * Phase 3: everything a church does to get ready for gift sync — set up the
 * "WGC Payments" payment source (which also proves write access), choose a
 * default fund, and map WGC funds to Planning Center funds. Nothing here
 * touches a WGC Payment; the only writes to Planning Center are creating or
 * re-saving the payment source and, on request, creating a fund.
 */

export interface Actor {
  userId: string;
  email?: string | null;
  role?: string | null;
  req?: Request;
}

const NOT_ENABLED_MESSAGE =
  "Giving doesn't appear to be turned on for this Planning Center organization. Enable Giving in Planning Center, then try again.";
const NO_PERMISSION_MESSAGE =
  "The connected Planning Center user doesn't have permission to manage Giving. Reconnect with a Finance Administrator account.";

async function requireConnectedConnection(churchId: string) {
  const connection = await prisma.planningCenterConnection.findUnique({ where: { churchId } });
  if (!connection || connection.status === "NOT_CONNECTED" || connection.status === "DISCONNECTED") {
    throw new PlanningCenterConnectionError("Connect Planning Center first.");
  }
  if (connection.status === "REAUTHENTICATION_REQUIRED") {
    throw new PlanningCenterConnectionError("This organization's Planning Center connection needs to be reconnected.");
  }
  if (!connection.pcoOrganizationId) {
    throw new PlanningCenterConnectionError("Connect Planning Center first.");
  }
  return { connection, pcoOrganizationId: connection.pcoOrganizationId };
}

/** Maps a Giving-call failure onto something the church can act on. */
function givingFailure(err: unknown): never {
  if (err instanceof PlanningCenterApiError) {
    if (err.status === 403) throw new PlanningCenterSetupError(NO_PERMISSION_MESSAGE);
    if (err.status === 404) throw new PlanningCenterSetupError(NOT_ENABLED_MESSAGE);
  }
  throw err;
}

function accessFromError(err: unknown): PcoGivingAccess | null {
  if (err instanceof PlanningCenterApiError) {
    if (err.status === 403) return "DENIED";
    if (err.status === 404) return "NOT_ENABLED";
  }
  return null;
}

function fundHealth(fund: PcoFund | undefined): MappingHealth {
  if (!fund) return "MISSING";
  return isFundUsable(fund) ? "OK" : "HIDDEN";
}

async function audit(churchId: string, actor: Actor, action: string, entityId: string | undefined, metadata?: Record<string, unknown>) {
  await logDashboardAction({
    churchId,
    actorUserId: actor.userId,
    actorEmail: actor.email,
    actorRole: actor.role,
    action,
    entityType: "PlanningCenterSyncConfig",
    entityId,
    metadata,
    req: actor.req,
  });
}

// ───────────────────────────── read ─────────────────────────────

/**
 * The full setup picture, read live from Planning Center so the church never
 * sees stale fund names or a mapping to a fund that was deleted last week.
 * Reads only — the one write is keeping `canReadGiving` truthful, which clears
 * the connect-time "can't access Giving" warning once access is fixed.
 */
export async function getGivingSetupState(churchId: string): Promise<GivingSetupState> {
  const { connection, pcoOrganizationId } = await requireConnectedConnection(churchId);
  const client = await getClientForChurch(churchId);

  const [wgcFunds, mappings, storedConfig] = await Promise.all([
    prisma.fund.findMany({ where: { churchId, isActive: true }, orderBy: [{ displayOrder: "asc" }, { name: "asc" }] }),
    prisma.planningCenterFundMapping.findMany({ where: { churchId } }),
    prisma.planningCenterSyncConfig.findUnique({ where: { churchId } }),
  ]);
  // A config left over from a different Planning Center organization is not ours to use.
  const config = storedConfig && storedConfig.pcoOrganizationId === pcoOrganizationId ? storedConfig : null;

  let pcoAccess: PcoGivingAccess = "OK";
  let pcoFunds: PcoFund[] = [];
  let sources: PcoPaymentSource[] = [];
  try {
    [pcoFunds, sources] = await Promise.all([listFunds(client), listPaymentSources(client)]);
  } catch (err) {
    const access = accessFromError(err);
    if (!access) throw err;
    pcoAccess = access;
  }

  // Keep the stored read-permission flag honest in both directions.
  if (pcoAccess !== "NOT_ENABLED") {
    const canRead = pcoAccess === "OK";
    if (connection.canReadGiving !== canRead) {
      await prisma.planningCenterConnection.updateMany({ where: { churchId }, data: { canReadGiving: canRead } });
      connection.canReadGiving = canRead;
    }
  }

  const fundById = new Map(pcoFunds.map((f) => [f.id, f]));
  const mappingByFund = new Map(mappings.map((m) => [m.fundId, m]));
  const usableByName = new Map<string, PcoFund>();
  for (const f of pcoFunds) {
    if (isFundUsable(f) && !usableByName.has(normalizeFundName(f.name))) usableByName.set(normalizeFundName(f.name), f);
  }

  const funds: GivingSetupFundRow[] = wgcFunds.map((fund) => {
    const m = mappingByFund.get(fund.id);
    if (m) {
      const live = fundById.get(m.pcoFundId);
      return {
        fundId: fund.id,
        name: fund.name,
        mapping: { pcoFundId: m.pcoFundId, pcoFundName: live?.name ?? m.pcoFundName, health: pcoAccess === "OK" ? fundHealth(live) : "OK" },
        suggestion: null,
      };
    }
    const match = usableByName.get(normalizeFundName(fund.name));
    return { fundId: fund.id, name: fund.name, mapping: null, suggestion: match ? { pcoFundId: match.id, pcoFundName: match.name } : null };
  });

  // Payment source
  const ourSource = config?.pcoPaymentSourceId ? sources.find((s) => s.id === config.pcoPaymentSourceId) : undefined;
  const sameNameSource = sources.find((s) => normalizeFundName(s.name) === normalizeFundName(PAYMENT_SOURCE_NAME));
  const paymentSourceState: GivingSetupState["paymentSource"]["state"] =
    pcoAccess !== "OK"
      ? config?.pcoPaymentSourceId ? "READY" : "MISSING" // can't verify while Giving is unreachable; show what's stored
      : ourSource ? (ourSource.status === "archived" ? "ARCHIVED" : "READY") : "MISSING";

  // Default fund
  const defaultLive = config?.defaultPcoFundId ? fundById.get(config.defaultPcoFundId) : undefined;
  const defaultFund = config?.defaultPcoFundId
    ? {
        pcoFundId: config.defaultPcoFundId,
        pcoFundName: defaultLive?.name ?? config.defaultPcoFundName ?? "",
        health: pcoAccess === "OK" ? fundHealth(defaultLive) : ("OK" as MappingHealth),
      }
    : null;
  const pcoDefault = pcoFunds.find((f) => f.isDefault && isFundUsable(f));

  const readiness = evaluateGivingReadiness({
    connectionHealthy: connection.status === "CONNECTED",
    organizationMatches: storedConfig ? storedConfig.pcoOrganizationId === pcoOrganizationId : true,
    canReadGiving: connection.canReadGiving,
    canWriteGiving: connection.canWriteGiving,
    paymentSource: paymentSourceState,
    defaultFund: defaultFund ? { name: defaultFund.pcoFundName, health: defaultFund.health } : null,
    funds: funds.map((f) => ({ name: f.name, mapping: f.mapping ? { health: f.mapping.health } : null })),
  });

  return {
    pcoAccess,
    organizationName: connection.pcoOrganizationName,
    canWriteGiving: connection.canWriteGiving,
    paymentSource: { state: paymentSourceState, name: PAYMENT_SOURCE_NAME, existingWillBeReused: !ourSource && Boolean(sameNameSource) },
    defaultFund,
    suggestedDefaultFund: pcoDefault ? { pcoFundId: pcoDefault.id, pcoFundName: pcoDefault.name } : null,
    funds,
    pcoFunds: pcoFunds
      .map((f) => ({ id: f.id, name: f.name, visibility: f.visibility, isDefault: f.isDefault, usable: isFundUsable(f) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    readiness,
  };
}

// ───────────────────────── payment source ─────────────────────────

/**
 * Sets up (or re-verifies) the "WGC Payments" payment source. Idempotent: an
 * existing source with that name is reused, and an archived one is
 * reactivated. Because every path ends in a write to Giving, success proves
 * the connected user can write there, and a 403 records that it can't.
 */
export async function ensurePaymentSource(churchId: string, actor: Actor) {
  const { pcoOrganizationId } = await requireConnectedConnection(churchId);
  const client = await getClientForChurch(churchId);

  const markWriteBlocked = async () => {
    await prisma.planningCenterConnection.updateMany({ where: { churchId }, data: { canWriteGiving: false } });
  };

  let sources: PcoPaymentSource[];
  try {
    sources = await listPaymentSources(client);
  } catch (err) {
    if (err instanceof PlanningCenterApiError && err.status === 403) {
      await prisma.planningCenterConnection.updateMany({ where: { churchId }, data: { canReadGiving: false } });
    }
    return givingFailure(err);
  }

  const wanted = normalizeFundName(PAYMENT_SOURCE_NAME);
  const existing = sources.find((s) => normalizeFundName(s.name) === wanted);

  let source: PcoPaymentSource;
  try {
    if (existing) {
      source = await touchPaymentSource(client, existing, { reactivate: existing.status === "archived" });
    } else {
      try {
        source = await createPaymentSource(client, PAYMENT_SOURCE_NAME);
      } catch (err) {
        // Lost a race (or a stale list): the name is taken now. Adopt it rather than fail.
        if (err instanceof PlanningCenterApiError && err.normalized.category === "VALIDATION_ERROR" && err.status !== 404) {
          const again = (await listPaymentSources(client)).find((s) => normalizeFundName(s.name) === wanted);
          if (!again) throw err;
          source = await touchPaymentSource(client, again, { reactivate: again.status === "archived" });
        } else {
          throw err;
        }
      }
    }
  } catch (err) {
    if (err instanceof PlanningCenterApiError && err.status === 403) await markWriteBlocked();
    return givingFailure(err);
  }

  await prisma.planningCenterConnection.updateMany({ where: { churchId }, data: { canReadGiving: true, canWriteGiving: true } });
  await ensureSyncConfig(churchId, pcoOrganizationId);
  const config = await prisma.planningCenterSyncConfig.update({
    where: { churchId },
    data: { pcoPaymentSourceId: source.id, pcoPaymentSourceName: source.name, paymentSourceReadyAt: new Date() },
  });
  await audit(churchId, actor, "planningcenter.payment_source_ready", config.id, { pcoPaymentSourceId: source.id, reused: Boolean(existing) });
  return { id: source.id, name: source.name, reused: Boolean(existing) };
}

// ─────────────────────────── default fund ───────────────────────────

export async function setDefaultFund(churchId: string, pcoFundId: string | null, actor: Actor) {
  const { pcoOrganizationId } = await requireConnectedConnection(churchId);
  const config = await ensureSyncConfig(churchId, pcoOrganizationId);

  if (pcoFundId === null) {
    await prisma.planningCenterSyncConfig.update({ where: { churchId }, data: { defaultPcoFundId: null, defaultPcoFundName: null } });
    await audit(churchId, actor, "planningcenter.default_fund_cleared", config.id);
    return null;
  }

  const target = await findUsableFund(churchId, pcoFundId);
  await prisma.planningCenterSyncConfig.update({
    where: { churchId },
    data: { defaultPcoFundId: target.id, defaultPcoFundName: target.name },
  });
  await audit(churchId, actor, "planningcenter.default_fund_set", config.id, { pcoFundId: target.id });
  return { pcoFundId: target.id, pcoFundName: target.name };
}

// ────────────────────────── fund mappings ──────────────────────────

/** Re-reads Planning Center so a mapping can never be saved to a fund that
 * doesn't exist, was just deleted, or can't receive gifts. */
async function findUsableFund(churchId: string, pcoFundId: string, client?: PlanningCenterClient): Promise<PcoFund> {
  const c = client ?? (await getClientForChurch(churchId));
  let funds: PcoFund[];
  try {
    funds = await listFunds(c);
  } catch (err) {
    return givingFailure(err);
  }
  const target = funds.find((f) => f.id === pcoFundId);
  if (!target) throw new PlanningCenterSetupError("That Planning Center fund no longer exists. Refresh the list and choose another.");
  if (!isFundUsable(target)) {
    throw new PlanningCenterSetupError(`“${target.name}” can't receive gifts (its visibility is set to “nowhere” in Planning Center). Choose another fund.`);
  }
  return target;
}

/** The WGC fund must belong to THIS church — the id comes from the client, the church from the session. */
async function requireOwnFund(churchId: string, fundId: string) {
  const fund = await prisma.fund.findFirst({ where: { id: fundId, churchId } });
  if (!fund) throw new PlanningCenterSetupError("That fund wasn't found.");
  return fund;
}

export async function saveFundMapping(churchId: string, fundId: string, pcoFundId: string | null, actor: Actor) {
  const fund = await requireOwnFund(churchId, fundId);

  if (pcoFundId === null) {
    await prisma.planningCenterFundMapping.deleteMany({ where: { churchId, fundId } });
    await audit(churchId, actor, "planningcenter.fund_unmapped", undefined, { fundId });
    return null;
  }

  if (!fund.isActive) throw new PlanningCenterSetupError("Only active funds can be mapped.");
  const { pcoOrganizationId } = await requireConnectedConnection(churchId);
  await ensureSyncConfig(churchId, pcoOrganizationId);

  const target = await findUsableFund(churchId, pcoFundId);
  await prisma.planningCenterFundMapping.upsert({
    where: { churchId_fundId: { churchId, fundId } },
    create: { churchId, fundId, pcoFundId: target.id, pcoFundName: target.name, mappedByUserId: actor.userId },
    update: { pcoFundId: target.id, pcoFundName: target.name, mappedByUserId: actor.userId },
  });
  await audit(churchId, actor, "planningcenter.fund_mapped", undefined, { fundId, pcoFundId: target.id });
  return { pcoFundId: target.id, pcoFundName: target.name };
}

/** Creates a new fund in Planning Center from a WGC fund, then maps to it. Never overwrites an existing fund. */
export async function createPlanningCenterFund(churchId: string, fundId: string, actor: Actor) {
  const fund = await requireOwnFund(churchId, fundId);
  if (!fund.isActive) throw new PlanningCenterSetupError("Only active funds can be mapped.");

  const existingMapping = await prisma.planningCenterFundMapping.findUnique({ where: { churchId_fundId: { churchId, fundId } } });
  if (existingMapping) throw new PlanningCenterSetupError(`“${fund.name}” is already mapped. Unmap it first if you want to create a new fund.`);

  const { pcoOrganizationId } = await requireConnectedConnection(churchId);
  await ensureSyncConfig(churchId, pcoOrganizationId);
  const client = await getClientForChurch(churchId);

  const collisionMessage = `A fund named “${fund.name}” already exists in Planning Center. Choose it from the list instead of creating a new one.`;
  let existing: PcoFund[];
  try {
    existing = await listFunds(client);
  } catch (err) {
    return givingFailure(err);
  }
  if (existing.some((f) => normalizeFundName(f.name) === normalizeFundName(fund.name))) {
    throw new PlanningCenterSetupError(collisionMessage);
  }

  let created: PcoFund;
  try {
    created = await createFund(client, { name: fund.name, description: fund.description });
  } catch (err) {
    if (err instanceof PlanningCenterApiError && err.normalized.category === "VALIDATION_ERROR" && err.status !== 404) {
      throw new PlanningCenterSetupError(collisionMessage);
    }
    return givingFailure(err);
  }

  await prisma.planningCenterFundMapping.upsert({
    where: { churchId_fundId: { churchId, fundId } },
    create: { churchId, fundId, pcoFundId: created.id, pcoFundName: created.name, mappedByUserId: actor.userId },
    update: { pcoFundId: created.id, pcoFundName: created.name, mappedByUserId: actor.userId },
  });
  await audit(churchId, actor, "planningcenter.fund_created_and_mapped", undefined, { fundId, pcoFundId: created.id });
  return { pcoFundId: created.id, pcoFundName: created.name };
}

/** Maps every still-unmapped active fund whose name matches a usable Planning Center fund exactly (ignoring case/spacing). */
export async function applySuggestedMappings(churchId: string, actor: Actor) {
  const { pcoOrganizationId } = await requireConnectedConnection(churchId);
  await ensureSyncConfig(churchId, pcoOrganizationId);
  const client = await getClientForChurch(churchId);

  let pcoFunds: PcoFund[];
  try {
    pcoFunds = await listFunds(client);
  } catch (err) {
    return givingFailure(err);
  }
  const usableByName = new Map<string, PcoFund>();
  for (const f of pcoFunds) {
    if (isFundUsable(f) && !usableByName.has(normalizeFundName(f.name))) usableByName.set(normalizeFundName(f.name), f);
  }

  const [wgcFunds, mappings] = await Promise.all([
    prisma.fund.findMany({ where: { churchId, isActive: true } }),
    prisma.planningCenterFundMapping.findMany({ where: { churchId }, select: { fundId: true } }),
  ]);
  const mapped = new Set(mappings.map((m) => m.fundId));

  const toMap = wgcFunds
    .filter((f) => !mapped.has(f.id))
    .map((f) => ({ fund: f, match: usableByName.get(normalizeFundName(f.name)) }))
    .filter((x): x is { fund: (typeof wgcFunds)[number]; match: PcoFund } => Boolean(x.match));

  if (toMap.length > 0) {
    await prisma.$transaction(
      toMap.map(({ fund, match }) =>
        prisma.planningCenterFundMapping.upsert({
          where: { churchId_fundId: { churchId, fundId: fund.id } },
          create: { churchId, fundId: fund.id, pcoFundId: match.id, pcoFundName: match.name, mappedByUserId: actor.userId },
          update: {},
        })
      )
    );
    await audit(churchId, actor, "planningcenter.fund_auto_matched", undefined, { count: toMap.length });
  }
  return { mapped: toMap.length, skipped: wgcFunds.length - mapped.size - toMap.length };
}
