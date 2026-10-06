import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCampaignsRaisedCentsBatch } from "@/lib/campaigns/campaignTotals";

/**
 * "Where your money came from" — splits the Transaction Insights payment
 * volume by source (giving pages / events / fundraising campaigns / pledges
 * / unattributed) so every dollar in the summary cards lands in exactly one
 * place.
 *
 * Money rules (financial reporting — read before changing):
 *  - The base set is the SAME one getPaymentsInsights' summary uses:
 *    FinixTransfer rows for the church, state SUCCEEDED, settlement
 *    transfers excluded, inside the date range, bridged to a Payment by
 *    finixTransferId for team/fundraiser view scope. Section totals therefore
 *    add up to "Total Transaction Volume" by construction.
 *  - Amounts are GROSS (before refunds), exactly like that summary.
 *  - One payment, one section. Precedence when signals overlap:
 *    EVENT (registration payment or the event's own link) >
 *    PLEDGE (Payment.pledgeId set) > CAMPAIGN (campaign/team/fundraiser link)
 *    > PLEDGE (pledge campaign's own link) > GIVING PAGE. A transfer with no
 *    Payment row or no giving link (Take a Payment, invoices) is OTHER.
 *  - "Donors" = distinct Payment.donorId. A payment with no matched donor
 *    counts once as its own identity (`payment:<id>`), mirroring
 *    campaignTotals.getDonorCount, so a real gift is never dropped from the
 *    count. Anonymity (isAnonymous) is a display flag only and does not
 *    change who counts as a donor.
 *  - Offline event money (CASH/CHECK door sales) never touches Finix and is
 *    reported separately; it is never added to processed volume.
 *  - Aggregation happens in SQL; no payment rows are loaded into memory.
 */

export type MoneySourceKind = "PAGE" | "EVENT" | "CAMPAIGN" | "PLEDGE";
export type MoneySourceKindOrOther = MoneySourceKind | "OTHER";

export interface LinkAssignment {
  kind: MoneySourceKind;
  entityId: string;
}

export interface LinkCatalog {
  links: { id: string; fundraisingCampaignId: string | null }[];
  events: { id: string; givingLinkId: string | null }[];
  campaigns: { id: string; givingLinkId: string | null }[];
  teams: { fundraisingCampaignId: string; givingLinkId: string | null }[];
  fundraisers: { fundraisingCampaignId: string; givingLinkId: string | null }[];
  pledgeCampaigns: { id: string; givingLinkId: string | null }[];
}

/**
 * Maps every GivingLink to the single section that owns it, so a link that
 * (through bad data) is tagged to several things still counts once.
 * Precedence: EVENT > CAMPAIGN > PLEDGE > PAGE.
 */
export function buildLinkAssignments(c: LinkCatalog): Map<string, LinkAssignment> {
  const out = new Map<string, LinkAssignment>();
  const set = (linkId: string | null, a: LinkAssignment) => {
    if (linkId) out.set(linkId, a);
  };
  // Lowest precedence first; later writes win.
  for (const l of c.links) set(l.id, { kind: "PAGE", entityId: l.id });
  for (const p of c.pledgeCampaigns) set(p.givingLinkId, { kind: "PLEDGE", entityId: p.id });
  for (const l of c.links) {
    if (l.fundraisingCampaignId) set(l.id, { kind: "CAMPAIGN", entityId: l.fundraisingCampaignId });
  }
  for (const x of c.campaigns) set(x.givingLinkId, { kind: "CAMPAIGN", entityId: x.id });
  for (const x of c.teams) set(x.givingLinkId, { kind: "CAMPAIGN", entityId: x.fundraisingCampaignId });
  for (const x of c.fundraisers) set(x.givingLinkId, { kind: "CAMPAIGN", entityId: x.fundraisingCampaignId });
  for (const e of c.events) set(e.givingLinkId, { kind: "EVENT", entityId: e.id });
  return out;
}

export interface SourceGroupRow {
  kind: MoneySourceKindOrOther;
  entityId: string | null;
  amountCents: number;
  payments: number;
  donors: number;
  registrations: number;
  attendees: number;
  /** Per-section total row (distinct donors across all of the section's rows). */
  rollup: boolean;
}

interface RawGroupRow {
  kind: string;
  entity_id: string | null;
  amount: bigint | number | null;
  payments: bigint | number;
  donors: bigint | number;
  registrations: bigint | number;
  attendees: bigint | number | null;
  is_rollup: boolean;
}

interface SourceQueryParams {
  churchId: string;
  dateFilter?: { gte: Date; lte?: Date };
  attributedUserId?: string;
  linkAssignments: Map<string, LinkAssignment>;
}

/** The shared `WITH map, base, classified` prefix — one definition of "which
 * transfers count" and "which section owns them" for every query below. */
function buildClassifiedCte(params: SourceQueryParams): Prisma.Sql {
  const { churchId, dateFilter, attributedUserId, linkAssignments } = params;
  const mapJson = JSON.stringify(
    Array.from(linkAssignments, ([linkId, a]) => ({ link_id: linkId, kind: a.kind, entity_id: a.entityId }))
  );
  const dateSql = dateFilter
    ? Prisma.sql`AND t."createdAtFinix" >= ${dateFilter.gte} ${
        dateFilter.lte ? Prisma.sql`AND t."createdAtFinix" <= ${dateFilter.lte}` : Prisma.empty
      }`
    : Prisma.empty;
  const scopeSql = attributedUserId ? Prisma.sql`AND p."attributedUserId" = ${attributedUserId}` : Prisma.empty;

  return Prisma.sql`
    WITH map AS (
      SELECT * FROM jsonb_to_recordset(${mapJson}::jsonb) AS m(link_id text, kind text, entity_id text)
    ),
    base AS (
      SELECT
        COALESCE(t."amountCents", 0) AS amount,
        p.id AS pid,
        COALESCE(p."donorId", 'payment:' || p.id) AS donor_key,
        p."givingLinkId" AS link_id,
        pl."pledgeCampaignId" AS pledge_campaign_id,
        r."eventId" AS reg_event_id,
        r.id AS reg_id,
        r."attendeeCount" AS attendees,
        t."finixTransferId" AS transfer_id,
        t."createdAtFinix" AS created_at,
        p."donorId" AS donor_id,
        d.name AS donor_name,
        COALESCE(p."isAnonymous", false) AS is_anonymous
      FROM "FinixTransfer" t
      LEFT JOIN "Payment" p
        ON p."finixTransferId" = t."finixTransferId" AND p."churchId" = t."churchId"
      LEFT JOIN "Donor" d
        ON d.id = p."donorId" AND d."churchId" = t."churchId"
      LEFT JOIN "Pledge" pl
        ON pl.id = p."pledgeId" AND pl."churchId" = t."churchId"
      LEFT JOIN LATERAL (
        SELECT er.id, er."eventId", er."attendeeCount"
        FROM "EventRegistration" er
        WHERE er."paymentId" = p.id AND er."churchId" = t."churchId"
        ORDER BY er."createdAt" ASC
        LIMIT 1
      ) r ON TRUE
      WHERE t."churchId" = ${churchId}
        AND UPPER(t.state) = 'SUCCEEDED'
        AND (t.subtype IS NULL OR t.subtype NOT LIKE '%SETTLEMENT%')
        ${dateSql}
        ${scopeSql}
    ),
    classified AS (
      SELECT
        b.*,
        CASE
          WHEN b.reg_event_id IS NOT NULL THEN 'EVENT'
          WHEN m.kind = 'EVENT' THEN 'EVENT'
          WHEN b.pledge_campaign_id IS NOT NULL THEN 'PLEDGE'
          WHEN m.kind IS NOT NULL THEN m.kind
          WHEN b.link_id IS NOT NULL THEN 'PAGE'
          ELSE 'OTHER'
        END AS kind,
        CASE
          WHEN b.reg_event_id IS NOT NULL THEN b.reg_event_id
          WHEN m.kind = 'EVENT' THEN m.entity_id
          WHEN b.pledge_campaign_id IS NOT NULL THEN b.pledge_campaign_id
          WHEN m.kind IS NOT NULL THEN m.entity_id
          WHEN b.link_id IS NOT NULL THEN b.link_id
          ELSE NULL
        END AS entity_id
      FROM base b
      LEFT JOIN map m ON m.link_id = b.link_id
    )
  `;
}

export function buildSourceGroupsQuery(params: SourceQueryParams): Prisma.Sql {
  return Prisma.sql`
    ${buildClassifiedCte(params)}
    SELECT
      kind,
      entity_id,
      SUM(amount)::bigint AS amount,
      COUNT(*)::bigint AS payments,
      COUNT(DISTINCT donor_key)::bigint AS donors,
      COUNT(reg_id)::bigint AS registrations,
      COALESCE(SUM(attendees), 0)::bigint AS attendees,
      (GROUPING(entity_id) = 1) AS is_rollup
    FROM classified
    GROUP BY GROUPING SETS ((kind, entity_id), (kind))
  `;
}

export const TRANSACTIONS_PER_ROW = 50;

export interface SourceTransaction {
  kind: MoneySourceKindOrOther;
  entityId: string | null;
  transferId: string;
  /** EventRegistration behind this payment, when it is an event payment. */
  registrationId: string | null;
  amountCents: number;
  createdAt: Date | null;
  donorId: string | null;
  /** null = guest with no matched donor record. */
  donorName: string | null;
  isAnonymous: boolean;
}

interface RawTxRow {
  kind: string;
  entity_id: string | null;
  transfer_id: string;
  reg_id: string | null;
  amount: bigint | number;
  created_at: Date | null;
  donor_id: string | null;
  donor_name: string | null;
  is_anonymous: boolean;
}

/** Latest TRANSACTIONS_PER_ROW payments per section row (window function, so
 * the database trims it — never every payment). Same base set and
 * classification as the group totals. */
export function buildSourceTransactionsQuery(params: SourceQueryParams): Prisma.Sql {
  return Prisma.sql`
    ${buildClassifiedCte(params)}
    SELECT kind, entity_id, transfer_id, reg_id, amount, created_at, donor_id, donor_name, is_anonymous
    FROM (
      SELECT
        c.*,
        ROW_NUMBER() OVER (PARTITION BY c.kind, c.entity_id ORDER BY c.created_at DESC NULLS LAST, c.transfer_id) AS rn
      FROM classified c
    ) ranked
    WHERE rn <= ${TRANSACTIONS_PER_ROW}
    ORDER BY created_at DESC NULLS LAST
  `;
}

export async function fetchSourceTransactions(params: SourceQueryParams): Promise<SourceTransaction[]> {
  const rows = await prisma.$queryRaw<RawTxRow[]>(buildSourceTransactionsQuery(params));
  return rows.map((r) => ({
    kind: r.kind as MoneySourceKindOrOther,
    entityId: r.entity_id,
    transferId: r.transfer_id,
    registrationId: r.reg_id,
    amountCents: Number(r.amount ?? 0),
    createdAt: r.created_at,
    donorId: r.donor_id,
    donorName: r.donor_name,
    isAnonymous: Boolean(r.is_anonymous),
  }));
}

export async function fetchSourceGroups(params: SourceQueryParams): Promise<SourceGroupRow[]> {
  const rows = await prisma.$queryRaw<RawGroupRow[]>(buildSourceGroupsQuery(params));
  return rows.map((r) => ({
    kind: r.kind as MoneySourceKindOrOther,
    entityId: r.entity_id,
    amountCents: Number(r.amount ?? 0),
    payments: Number(r.payments),
    donors: Number(r.donors),
    registrations: Number(r.registrations),
    attendees: Number(r.attendees ?? 0),
    rollup: Boolean(r.is_rollup),
  }));
}

// ---------------------------------------------------------------- results

export interface MoneyRowBase {
  id: string;
  name: string;
  href: string;
  amountCents: number;
  donors: number;
  payments: number;
  /** Share of this section's total, 0–100, for the inline bar. */
  sharePercent: number;
  /** Who paid: the latest TRANSACTIONS_PER_ROW payments, newest first. */
  transactions: SourceTransaction[];
}

export interface GivingPageRow extends MoneyRowBase {
  averageGiftCents: number;
}

export interface EventAttendeeInfo {
  id: string;
  eventId: string;
  registrationId: string;
  name: string;
  /** Who bought the ticket, when that is a different person. */
  registrantName: string;
  /** CARD = processed online/door card; CASH | CHECK = offline door sale. */
  paidVia: "CARD" | "CASH" | "CHECK";
  checkedIn: boolean;
}

export interface EventRow extends MoneyRowBase {
  /** Named attendees of the registrations behind this row's payments, plus
   * offline door sales in range. Capped by the per-row payment list. */
  attendeeList: EventAttendeeInfo[];
  registrations: number;
  attendees: number;
  /** Door cash/check — never part of amountCents or any processed total. */
  offlineCents: number;
  offlineRegistrations: number;
}

export interface CampaignRow extends MoneyRowBase {
  goalAmountCents: number | null;
  /** Lifetime raised from campaignTotals — what the campaign page shows. */
  lifetimeRaisedCents: number;
  /** Lifetime raised ÷ goal, 0+ (can exceed 100). null without a goal. */
  percentOfGoal: number | null;
}

export interface PledgeRow extends MoneyRowBase {
  /** Lifetime: non-canceled pledges. */
  pledgedCents: number;
  pledgersCount: number;
  payersCount: number;
  /** Lifetime fulfilled (Pledge.fulfilledAmountCents, includes external). */
  fulfilledCents: number;
  fulfilledPercent: number | null;
}

export interface MoneySection<T> {
  totalCents: number;
  donors: number;
  payments: number;
  rows: T[];
}

export interface WhereMoneyCameFrom {
  givingPages: MoneySection<GivingPageRow>;
  events: MoneySection<EventRow> & { offlineCents: number };
  campaigns: MoneySection<CampaignRow>;
  pledges: MoneySection<PledgeRow>;
  other: { totalCents: number; payments: number; transactions: SourceTransaction[] };
  /** Sum of every section + other. Equals the summary's total volume. */
  totalCents: number;
}

export interface EntityCatalogs {
  givingLinks: { id: string; internalName: string; publicTitle: string }[];
  events: { id: string; name: string }[];
  campaigns: { id: string; name: string; goalAmountCents: number | null }[];
  pledgeCampaigns: { id: string; name: string }[];
  campaignLifetimeRaised: Map<string, number>;
  offlineByEvent: Map<string, { cents: number; registrations: number }>;
  pledgeStats: Map<string, { pledgedCents: number; fulfilledCents: number; pledgers: number; payers: number }>;
}

function withShares<T extends { amountCents: number; sharePercent: number }>(rows: T[]): T[] {
  const total = rows.reduce((s, r) => s + r.amountCents, 0);
  return rows
    .map((r) => ({ ...r, sharePercent: total > 0 ? (r.amountCents / total) * 100 : 0 }))
    .sort((a, b) => b.amountCents - a.amountCents);
}

function section<T extends MoneyRowBase>(rows: T[], distinctDonors: number): MoneySection<T> {
  const sorted = withShares(rows);
  return {
    totalCents: sorted.reduce((s, r) => s + r.amountCents, 0),
    // Distinct across the whole section (from the SQL rollup), so a donor
    // who gave to two rows is one donor here even though each row counts them.
    donors: distinctDonors,
    payments: sorted.reduce((s, r) => s + r.payments, 0),
    rows: sorted,
  };
}

/** Pure assembly of SQL groups + catalogs into the page model. */
export function assembleWhereMoneyCameFrom(
  groups: SourceGroupRow[],
  cat: EntityCatalogs,
  transactions: SourceTransaction[] = [],
  attendees: EventAttendeeInfo[] = []
): WhereMoneyCameFrom {
  const attendeesFor = (eventId: string) =>
    attendees
      .filter((a) => a.eventId === eventId)
      .sort((a, b) => a.name.localeCompare(b.name));
  const txFor = (kind: MoneySourceKindOrOther, entityId: string | null) =>
    transactions.filter((t) => t.kind === kind && t.entityId === entityId);
  const knownEntity = (kind: MoneySourceKind, id: string) =>
    (kind === "PAGE" && cat.givingLinks.some((l) => l.id === id)) ||
    (kind === "EVENT" && cat.events.some((e) => e.id === id)) ||
    (kind === "CAMPAIGN" && cat.campaigns.some((c) => c.id === id)) ||
    (kind === "PLEDGE" && cat.pledgeCampaigns.some((p) => p.id === id));
  const linkById = new Map(cat.givingLinks.map((l) => [l.id, l]));
  const eventById = new Map(cat.events.map((e) => [e.id, e]));
  const campaignById = new Map(cat.campaigns.map((c) => [c.id, c]));
  const pledgeCampaignById = new Map(cat.pledgeCampaigns.map((p) => [p.id, p]));

  const pages: GivingPageRow[] = [];
  const events: EventRow[] = [];
  const campaigns: CampaignRow[] = [];
  const pledges: PledgeRow[] = [];
  let otherCents = 0;
  let otherPayments = 0;
  // Money tied to an entity we couldn't name (deleted/other-tenant row) must
  // still be counted — fold it into "other" rather than dropping it.
  const orphan = (g: SourceGroupRow) => {
    otherCents += g.amountCents;
    otherPayments += g.payments;
  };

  // Unattributed = genuinely unlinked payments plus any whose entity we
  // couldn't name, so the "who paid" list matches the folded-in total.
  const otherTransactions = transactions
    .filter((t) => t.kind === "OTHER" || !t.entityId || !knownEntity(t.kind, t.entityId))
    .slice(0, TRANSACTIONS_PER_ROW);
  const rollupDonors = (kind: MoneySourceKind) => groups.find((g) => g.rollup && g.kind === kind)?.donors ?? 0;

  for (const g of groups) {
    if (g.rollup) continue;
    const base = {
      amountCents: g.amountCents,
      donors: g.donors,
      payments: g.payments,
      sharePercent: 0,
      transactions: txFor(g.kind, g.entityId),
    };
    if (g.kind === "OTHER" || !g.entityId) {
      orphan(g);
    } else if (g.kind === "PAGE") {
      const link = linkById.get(g.entityId);
      if (!link) orphan(g);
      else
        pages.push({
          ...base,
          id: link.id,
          name: link.publicTitle || link.internalName,
          href: `/merchant/giving-links/${link.id}`,
          averageGiftCents: g.payments > 0 ? Math.round(g.amountCents / g.payments) : 0,
        });
    } else if (g.kind === "EVENT") {
      const ev = eventById.get(g.entityId);
      if (!ev) orphan(g);
      else {
        const off = cat.offlineByEvent.get(ev.id);
        events.push({
          ...base,
          id: ev.id,
          name: ev.name,
          href: `/merchant/events/${ev.id}`,
          registrations: g.registrations,
          attendees: g.attendees,
          attendeeList: attendeesFor(ev.id),
          offlineCents: off?.cents ?? 0,
          offlineRegistrations: off?.registrations ?? 0,
        });
      }
    } else if (g.kind === "CAMPAIGN") {
      const c = campaignById.get(g.entityId);
      if (!c) orphan(g);
      else {
        const lifetime = cat.campaignLifetimeRaised.get(c.id) ?? 0;
        campaigns.push({
          ...base,
          id: c.id,
          name: c.name,
          href: `/merchant/campaigns/${c.id}`,
          goalAmountCents: c.goalAmountCents,
          lifetimeRaisedCents: lifetime,
          percentOfGoal: c.goalAmountCents ? (lifetime / c.goalAmountCents) * 100 : null,
        });
      }
    } else if (g.kind === "PLEDGE") {
      const pc = pledgeCampaignById.get(g.entityId);
      if (!pc) orphan(g);
      else {
        const st = cat.pledgeStats.get(pc.id) ?? { pledgedCents: 0, fulfilledCents: 0, pledgers: 0, payers: 0 };
        pledges.push({
          ...base,
          id: pc.id,
          name: pc.name,
          href: `/merchant/pledge-campaigns/${pc.id}`,
          pledgedCents: st.pledgedCents,
          pledgersCount: st.pledgers,
          payersCount: st.payers,
          fulfilledCents: st.fulfilledCents,
          fulfilledPercent: st.pledgedCents > 0 ? (st.fulfilledCents / st.pledgedCents) * 100 : null,
        });
      }
    }
  }

  // An event with only door cash/check in range has no processed group —
  // still list it so the offline figure isn't hidden.
  const listedEvents = new Set(events.map((e) => e.id));
  for (const [eventId, off] of cat.offlineByEvent) {
    const ev = eventById.get(eventId);
    if (!ev || listedEvents.has(eventId) || off.cents <= 0) continue;
    events.push({
      id: ev.id,
      name: ev.name,
      href: `/merchant/events/${ev.id}`,
      amountCents: 0,
      donors: 0,
      payments: 0,
      sharePercent: 0,
      transactions: [],
      registrations: 0,
      attendees: 0,
      attendeeList: attendeesFor(ev.id),
      offlineCents: off.cents,
      offlineRegistrations: off.registrations,
    });
  }

  const givingPages = section(pages, rollupDonors("PAGE"));
  const eventsSection = section(events, rollupDonors("EVENT"));
  const campaignsSection = section(campaigns, rollupDonors("CAMPAIGN"));
  const pledgesSection = section(pledges, rollupDonors("PLEDGE"));
  const offlineCents = eventsSection.rows.reduce((s, r) => s + r.offlineCents, 0);

  return {
    givingPages,
    events: { ...eventsSection, offlineCents },
    campaigns: campaignsSection,
    pledges: pledgesSection,
    other: { totalCents: otherCents, payments: otherPayments, transactions: otherTransactions },
    totalCents:
      givingPages.totalCents +
      eventsSection.totalCents +
      campaignsSection.totalCents +
      pledgesSection.totalCents +
      otherCents,
  };
}


/**
 * Named attendees for the event rows: guests of the registrations behind the
 * listed processed payments, plus guests of door cash/check sales in range
 * (those have no payment row). Bounded by the per-row payment cap.
 */
export async function fetchEventAttendees(params: {
  churchId: string;
  processedRegistrationIds: string[];
  rangeFilter?: { gte: Date; lte?: Date };
  attributedUserId?: string;
}): Promise<EventAttendeeInfo[]> {
  const { churchId, processedRegistrationIds, rangeFilter, attributedUserId } = params;
  const registrations = await prisma.eventRegistration.findMany({
    where: {
      churchId,
      status: "CONFIRMED",
      OR: [
        ...(processedRegistrationIds.length ? [{ id: { in: processedRegistrationIds } }] : []),
        {
          paymentMethod: { in: ["CASH", "CHECK"] },
          soldAtDoor: true,
          ...(rangeFilter ? { confirmedAt: rangeFilter } : {}),
          ...(attributedUserId ? { soldByUserId: attributedUserId } : {}),
        },
      ],
    },
    select: { id: true, eventId: true, registrantFirstName: true, registrantLastName: true, paymentMethod: true },
    take: 1000,
  });
  if (registrations.length === 0) return [];
  const byId = new Map(registrations.map((r) => [r.id, r]));
  const rows = await prisma.eventAttendee.findMany({
    where: { churchId, registrationId: { in: registrations.map((r) => r.id) } },
    select: { id: true, registrationId: true, firstName: true, lastName: true, checkedIn: true },
  });
  return rows.map((a) => {
    const reg = byId.get(a.registrationId)!;
    const method = reg.paymentMethod === "CASH" || reg.paymentMethod === "CHECK" ? reg.paymentMethod : "CARD";
    return {
      id: a.id,
      eventId: reg.eventId,
      registrationId: a.registrationId,
      name: `${a.firstName} ${a.lastName}`.trim(),
      registrantName: `${reg.registrantFirstName} ${reg.registrantLastName}`.trim(),
      paidVia: method,
      checkedIn: a.checkedIn,
    };
  });
}

// ---------------------------------------------------------------- DB entry

export async function getWhereMoneyCameFrom(
  churchId: string,
  dateFilter: { gte: Date; lte?: Date } | undefined,
  attributedUserId?: string
): Promise<WhereMoneyCameFrom> {
  // Small per-church catalogs (not payments) — needed to name rows and to
  // decide which section owns each giving link.
  const [links, events, campaigns, teams, fundraisers, pledgeCampaigns] = await Promise.all([
    prisma.givingLink.findMany({
      where: { churchId },
      select: { id: true, internalName: true, publicTitle: true, fundraisingCampaignId: true },
    }),
    prisma.event.findMany({ where: { churchId }, select: { id: true, name: true, givingLinkId: true } }),
    prisma.fundraisingCampaign.findMany({
      where: { churchId },
      select: { id: true, name: true, goalAmountCents: true, givingLinkId: true },
    }),
    prisma.campaignTeam.findMany({ where: { churchId }, select: { fundraisingCampaignId: true, givingLinkId: true } }),
    prisma.campaignFundraiser.findMany({
      where: { churchId },
      select: { fundraisingCampaignId: true, givingLinkId: true },
    }),
    prisma.pledgeCampaign.findMany({ where: { churchId }, select: { id: true, name: true, givingLinkId: true } }),
  ]);

  const linkAssignments = buildLinkAssignments({
    links,
    events,
    campaigns,
    teams,
    fundraisers,
    pledgeCampaigns,
  });

  const rangeFilter = dateFilter ? { gte: dateFilter.gte, ...(dateFilter.lte ? { lte: dateFilter.lte } : {}) } : undefined;

  const [groups, transactions, lifetimeRaised, offline, pledgeAgg, payerAgg] = await Promise.all([
    fetchSourceGroups({ churchId, dateFilter, attributedUserId, linkAssignments }),
    fetchSourceTransactions({ churchId, dateFilter, attributedUserId, linkAssignments }),
    getCampaignsRaisedCentsBatch(
      churchId,
      campaigns.map((c) => c.id)
    ),
    // Door cash/check: recorded by staff, no Payment row, separate figure.
    prisma.eventRegistration.groupBy({
      by: ["eventId"],
      where: {
        churchId,
        status: "CONFIRMED",
        paymentMethod: { in: ["CASH", "CHECK"] },
        soldAtDoor: true,
        ...(rangeFilter ? { confirmedAt: rangeFilter } : {}),
        ...(attributedUserId ? { soldByUserId: attributedUserId } : {}),
      },
      _sum: { totalCents: true },
      _count: { _all: true },
    }),
    prisma.pledge.groupBy({
      by: ["pledgeCampaignId"],
      where: { churchId, status: { not: "CANCELED" }, ...(attributedUserId ? { attributedUserId } : {}) },
      _sum: { pledgeAmountCents: true, fulfilledAmountCents: true },
      _count: { _all: true },
    }),
    prisma.pledge.groupBy({
      by: ["pledgeCampaignId"],
      where: {
        churchId,
        status: { not: "CANCELED" },
        fulfilledAmountCents: { gt: 0 },
        ...(attributedUserId ? { attributedUserId } : {}),
      },
      _count: { _all: true },
    }),
  ]);

  const attendees = await fetchEventAttendees({
    churchId,
    processedRegistrationIds: transactions
      .filter((t) => t.kind === "EVENT" && t.registrationId)
      .map((t) => t.registrationId as string),
    rangeFilter,
    attributedUserId,
  });

  const payersByCampaign = new Map(payerAgg.map((r) => [r.pledgeCampaignId, r._count._all]));
  const pledgeStats = new Map(
    pledgeAgg.map((r) => [
      r.pledgeCampaignId,
      {
        pledgedCents: r._sum.pledgeAmountCents ?? 0,
        fulfilledCents: r._sum.fulfilledAmountCents ?? 0,
        pledgers: r._count._all,
        payers: payersByCampaign.get(r.pledgeCampaignId) ?? 0,
      },
    ])
  );

  return assembleWhereMoneyCameFrom(groups, {
    givingLinks: links,
    events,
    campaigns,
    pledgeCampaigns,
    campaignLifetimeRaised: lifetimeRaised,
    offlineByEvent: new Map(
      offline.map((r) => [r.eventId, { cents: r._sum.totalCents ?? 0, registrations: r._count._all }])
    ),
    pledgeStats,
  }, transactions, attendees);
}
