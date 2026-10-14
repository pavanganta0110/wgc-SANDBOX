import type { PcoDonation } from "./givingApi";

/**
 * Resolving an UNKNOWN write outcome by reading, never by re-sending.
 *
 * Planning Center has no idempotency key and a donation has no field for our
 * own id, so when a POST times out we cannot tell whether it landed. We find
 * out by listing the batch and looking for donations we have no record of
 * that match what we were sending (same person, amount, source and — within
 * a day, because Planning Center may shift a date-only value by the
 * organization's timezone — date).
 *
 * Pure: no I/O, so every branch is unit-tested.
 */

/** How long after a send we wait before concluding "it never landed". A
 * request that timed out client-side can still complete on Planning Center's
 * side, so concluding too early could cause a duplicate. */
export const RECONCILE_GRACE_MS = 2 * 60 * 1000;

export interface SendingRecord {
  id: string;
  pcoPersonId: string | null;
  amountCents: number;
  receivedOn: string;
  sendingStartedAt: Date;
}

export interface ReconcileDecision {
  /** Records we can prove were created, with the Planning Center donation that is theirs. */
  adopt: Array<{ recordId: string; pcoDonationId: string }>;
  /** Records proven NOT created (grace period passed, nothing matches): safe to send again. */
  notCreated: string[];
  /** Records we must not decide: left alone until the grace period passes. */
  wait: string[];
  /** Records a human must look at (more matching donations than we sent). */
  undecidable: string[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function withinOneDay(a: string, b: string): boolean {
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(da) || Number.isNaN(db)) return false;
  return Math.abs(da - db) <= DAY_MS;
}

/**
 * `unrecorded` MUST already exclude every donation we hold a record for and
 * every donation from another payment source; this function only pairs what
 * is left with what we were in the middle of sending.
 */
export function reconcileSending(sending: SendingRecord[], unrecorded: PcoDonation[], now: Date): ReconcileDecision {
  const decision: ReconcileDecision = { adopt: [], notCreated: [], wait: [], undecidable: [] };
  const taken = new Set<string>();

  // Group by (person, amount) so two identical gifts (same donor, same amount) are handled together.
  const groups = new Map<string, SendingRecord[]>();
  for (const r of sending) {
    const key = `${r.pcoPersonId ?? "anon"}|${r.amountCents}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  for (const [key, records] of groups) {
    const [person, amount] = key.split("|");
    const personId = person === "anon" ? null : person;
    const candidates = unrecorded.filter((d) => d.personId === personId && d.amountCents === Number(amount) && !taken.has(d.id));

    // Pair each record with a candidate on a matching date, oldest first.
    const ordered = [...records].sort((a, b) => a.sendingStartedAt.getTime() - b.sendingStartedAt.getTime());
    const matched: Array<{ record: SendingRecord; donation: PcoDonation }> = [];
    const pool = [...candidates];
    for (const record of ordered) {
      const idx = pool.findIndex((d) => withinOneDay(d.receivedOn, record.receivedOn));
      if (idx >= 0) {
        matched.push({ record, donation: pool[idx] });
        pool.splice(idx, 1);
      }
    }

    // More matching donations than records we were sending means something
    // else (a person entering gifts by hand) also matches. We can't tell
    // which one is ours, so a human must look.
    const allMatching = candidates.filter((d) => records.some((r) => withinOneDay(d.receivedOn, r.receivedOn)));
    if (allMatching.length > records.length) {
      for (const r of records) decision.undecidable.push(r.id);
      continue;
    }

    for (const { record, donation } of matched) {
      decision.adopt.push({ recordId: record.id, pcoDonationId: donation.id });
      taken.add(donation.id);
    }

    const matchedIds = new Set(matched.map((m) => m.record.id));
    for (const record of ordered) {
      if (matchedIds.has(record.id)) continue;
      const aged = now.getTime() - record.sendingStartedAt.getTime() >= RECONCILE_GRACE_MS;
      if (aged) decision.notCreated.push(record.id);
      else decision.wait.push(record.id);
    }
  }
  return decision;
}
