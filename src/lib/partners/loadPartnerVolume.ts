import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { JOINS, METHOD_SQL, SUCCESSFUL_CHARGE_WHERE, inRange, type MethodKey } from "@/lib/admin/platformMetrics";

/**
 * What a partner's clients processed: volume split by card and ACH, refunds and returns, a row per client with the
 * agent who brought it, and a transaction list. `partnerId` and `agentId` come from the signed-in session, never
 * from the request, so a partner sees only its own clients and an agent only theirs. It deliberately has nothing
 * about WGC's fees, the processor's costs or WGC's revenue, and no payer names or emails.
 */

export interface VolumeSlice {
  amountCents: number;
  count: number;
}

export interface ClientVolumeRow {
  churchId: string;
  name: string;
  status: string;
  /** Null = no agent brought this client. */
  agentId: string | null;
  agentName: string | null;
  joinedAt: string;
  card: VolumeSlice;
  ach: VolumeSlice;
  totalCents: number;
  paymentCount: number;
}

export interface TransactionRow {
  id: string;
  createdAt: string;
  churchId: string;
  clientName: string;
  agentName: string | null;
  method: MethodKey;
  amountCents: number;
}

export interface PartnerVolume {
  from: string;
  to: string;
  total: VolumeSlice;
  card: VolumeSlice;
  ach: VolumeSlice;
  other: VolumeSlice;
  refundsCents: number;
  returnsCents: number;
  netCents: number;
  clients: ClientVolumeRow[];
  transactions: TransactionRow[];
  transactionsTruncated: boolean;
}

export const TRANSACTION_LIMIT = 200;
const num = (v: bigint | number | null | undefined) => Number(v ?? 0);
const empty = (): VolumeSlice => ({ amountCents: 0, count: 0 });

export async function loadPartnerVolume(params: {
  partnerId: string;
  /** Set for an agent's login: limits everything to that agent's clients. */
  agentId?: string;
  from: Date;
  to: Date;
  /** Optional filters for the transaction list. A client outside the scope is ignored. */
  churchId?: string;
  method?: "CARD" | "ACH";
}): Promise<PartnerVolume> {
  const { partnerId, agentId, from, to } = params;
  const churches = await prisma.church.findMany({
    where: { partnerId, ...(agentId ? { partnerAgentId: agentId } : {}) },
    select: { id: true, name: true, status: true, partnerAgentId: true, createdAt: true },
    orderBy: { name: "asc" },
  });
  const agents = await prisma.partnerAgent.findMany({ where: { partnerId }, select: { id: true, name: true } });
  const agentName = new Map(agents.map((a) => [a.id, a.name]));
  const clientName = new Map(churches.map((c) => [c.id, c]));
  const ids = churches.map((c) => c.id);

  const result: PartnerVolume = {
    from: from.toISOString(),
    to: to.toISOString(),
    total: empty(), card: empty(), ach: empty(), other: empty(),
    refundsCents: 0, returnsCents: 0, netCents: 0,
    clients: [], transactions: [], transactionsTruncated: false,
  };
  if (ids.length === 0) return result;

  const inIds = Prisma.join(ids);
  const created = Prisma.sql`ft."createdAtFinix"`;
  const filterIds = params.churchId && ids.includes(params.churchId) ? [params.churchId] : ids;
  const methodFilter = params.method ? Prisma.sql`AND ${METHOD_SQL} = ${params.method}` : Prisma.empty;

  const [byClient, refunds, returns, txRows] = await Promise.all([
    prisma.$queryRaw<{ church_id: string; method: MethodKey; amount: bigint | null; count: bigint }[]>(Prisma.sql`
      SELECT ft."churchId" AS church_id, ${METHOD_SQL} AS method, SUM(ft."amountCents") AS amount, COUNT(*) AS count
      FROM "FinixTransfer" ft
      ${JOINS}
      WHERE ${SUCCESSFUL_CHARGE_WHERE} AND ft."churchId" IN (${inIds}) AND ${inRange(created, from, to)}
      GROUP BY 1, 2`),
    prisma.finixRefundOrReversal.aggregate({
      where: { churchId: { in: ids }, state: { equals: "SUCCEEDED", mode: "insensitive" }, createdAtFinix: { gte: from, lt: to } },
      _sum: { amountCents: true },
    }),
    prisma.bankReturn.aggregate({ where: { churchId: { in: ids }, createdAtFinix: { gte: from, lt: to } }, _sum: { amountCents: true } }),
    prisma.$queryRaw<{ id: string; created: Date; church_id: string; method: MethodKey; amount: bigint | null }[]>(Prisma.sql`
      SELECT ft."finixTransferId" AS id, ft."createdAtFinix" AS created, ft."churchId" AS church_id, ${METHOD_SQL} AS method, ft."amountCents" AS amount
      FROM "FinixTransfer" ft
      ${JOINS}
      WHERE ${SUCCESSFUL_CHARGE_WHERE} AND ft."churchId" IN (${Prisma.join(filterIds)}) AND ${inRange(created, from, to)} ${methodFilter}
      ORDER BY ft."createdAtFinix" DESC
      LIMIT ${TRANSACTION_LIMIT + 1}`),
  ]);

  const perClient = new Map<string, { card: VolumeSlice; ach: VolumeSlice; other: VolumeSlice }>();
  for (const r of byClient) {
    const row = perClient.get(r.church_id) ?? { card: empty(), ach: empty(), other: empty() };
    const slice = r.method === "CARD" ? row.card : r.method === "ACH" ? row.ach : row.other;
    slice.amountCents += num(r.amount);
    slice.count += num(r.count);
    perClient.set(r.church_id, row);
    const top = r.method === "CARD" ? result.card : r.method === "ACH" ? result.ach : result.other;
    top.amountCents += num(r.amount);
    top.count += num(r.count);
  }
  result.total = {
    amountCents: result.card.amountCents + result.ach.amountCents + result.other.amountCents,
    count: result.card.count + result.ach.count + result.other.count,
  };
  result.refundsCents = refunds._sum.amountCents ?? 0;
  result.returnsCents = returns._sum.amountCents ?? 0;
  result.netCents = result.total.amountCents - result.refundsCents - result.returnsCents;

  result.clients = churches
    .map((c): ClientVolumeRow => {
      const v = perClient.get(c.id) ?? { card: empty(), ach: empty(), other: empty() };
      return {
        churchId: c.id,
        name: c.name,
        status: c.status,
        agentId: c.partnerAgentId,
        agentName: c.partnerAgentId ? (agentName.get(c.partnerAgentId) ?? null) : null,
        joinedAt: c.createdAt.toISOString(),
        card: v.card,
        ach: v.ach,
        totalCents: v.card.amountCents + v.ach.amountCents + v.other.amountCents,
        paymentCount: v.card.count + v.ach.count + v.other.count,
      };
    })
    .sort((a, b) => b.totalCents - a.totalCents || a.name.localeCompare(b.name));

  result.transactionsTruncated = txRows.length > TRANSACTION_LIMIT;
  result.transactions = txRows.slice(0, TRANSACTION_LIMIT).map((t) => {
    const c = clientName.get(t.church_id);
    return {
      id: t.id,
      createdAt: new Date(t.created).toISOString(),
      churchId: t.church_id,
      clientName: c?.name ?? "Client",
      agentName: c?.partnerAgentId ? (agentName.get(c.partnerAgentId) ?? null) : null,
      method: t.method,
      amountCents: num(t.amount),
    };
  });
  return result;
}

/** "2026-02" -> that month [from, to); "all" -> everything up to now. Anything else -> the current month. */
export function parseVolumePeriod(value: string | undefined, now: Date = new Date()): { from: Date; to: Date; key: string } {
  if (value === "all") return { from: new Date(Date.UTC(2020, 0, 1)), to: new Date(now.getTime() + 1000), key: "all" };
  const m = value && /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  const y = m ? Number(m[1]) : now.getUTCFullYear();
  const mo = m ? Number(m[2]) - 1 : now.getUTCMonth();
  return {
    from: new Date(Date.UTC(y, mo, 1)),
    to: new Date(Date.UTC(y, mo + 1, 1)),
    key: `${y}-${String(mo + 1).padStart(2, "0")}`,
  };
}
