import { normalizeEmail, normalizePhone } from "@/lib/donors/donorContact";

/**
 * Confidence-scored fuzzy matching for the "does this newly-entered/
 * imported donor already exist" question. Deliberately NOT used by the
 * public Finix checkout path (resolveOrCreateDonor stays exact-match-only
 * there — a live donation form must resolve instantly and can never block
 * or ask a donor to disambiguate themselves). This module only backs the
 * merchant-side External Donation manual-entry and CSV-import flows, where
 * a staff member enters someone else's information and a human review
 * step before merging is exactly what the spec requires.
 *
 * Tiers:
 *  - HIGH: exact normalizedEmail, normalizedPhone, or finixIdentityId —
 *    handled entirely by resolveOrCreateDonor's existing exact-match path;
 *    this module is never even called in that case (see findScoredPossibleMatches).
 *  - MEDIUM: similar name AND (same address, OR partial phone match, OR
 *    similar email) — never auto-merged, always requires a reviewer to
 *    confirm via the possible-match queue.
 *  - LOW: name similarity alone, nothing else corroborating — never
 *    surfaced as a possible match; a new donor is created silently, same
 *    as today. Matching on a bare name is explicitly disallowed by the spec.
 */

export type MatchConfidence = "HIGH" | "MEDIUM" | "LOW" | "NONE";

export interface MatchCandidateDonor {
  id: string;
  name: string | null;
  email: string | null;
  normalizedEmail: string | null;
  phone: string | null;
  normalizedPhone: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  finixIdentityId: string | null;
}

export interface NewDonorCandidateInput {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  finixIdentityId?: string | null;
}

export interface ScoredMatch {
  confidence: MatchConfidence;
  score: number;
  matchedFields: string[];
  conflictingFields: string[];
  reason: string;
}

function normalizeName(name: string | null | undefined): string | null {
  const trimmed = name?.trim().toLowerCase().replace(/\s+/g, " ");
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function normalizeAddress(addressLine1: string | null | undefined): string | null {
  const trimmed = addressLine1?.trim().toLowerCase().replace(/\s+/g, " ");
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

/** Last 4 digits of a normalized phone — a common "same number, one digit
 * mistyped during manual entry" partial-match signal. */
function last4(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

function emailLocalPart(email: string | null): string | null {
  if (!email) return null;
  const at = email.indexOf("@");
  return at > 0 ? email.slice(0, at) : null;
}

/** Levenshtein distance, small-string implementation (names are short —
 * no need for a banded/optimized variant). */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = Array(n + 1)
    .fill(0)
    .map((_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[n];
}

/** 0..1, 1 = identical. Names within ~85% similarity (short edit distance
 * relative to length) count as "similar" for MEDIUM-confidence purposes. */
function nameSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

const NAME_SIMILARITY_THRESHOLD = 0.85;

/**
 * Scores a single existing donor against a new-donor candidate. Never
 * returns HIGH — HIGH is exact-match territory, handled upstream by
 * resolveOrCreateDonor before this function is ever consulted.
 */
export function scoreDonorMatch(existing: MatchCandidateDonor, candidate: NewDonorCandidateInput): ScoredMatch {
  const matchedFields: string[] = [];
  const conflictingFields: string[] = [];

  const existingName = normalizeName(existing.name);
  const candidateName = normalizeName(candidate.name);
  const nameSim = existingName && candidateName ? nameSimilarity(existingName, candidateName) : 0;
  const nameSimilar = nameSim >= NAME_SIMILARITY_THRESHOLD;
  if (existingName && candidateName) {
    if (nameSimilar) matchedFields.push("name");
    else conflictingFields.push("name");
  }

  const existingAddress = normalizeAddress(existing.addressLine1);
  const candidateAddress = normalizeAddress(candidate.addressLine1);
  const sameCity = (existing.city || "").trim().toLowerCase() === (candidate.city || "").trim().toLowerCase();
  const samePostal = (existing.postalCode || "").trim() === (candidate.postalCode || "").trim();
  const sameAddress = Boolean(existingAddress && candidateAddress && existingAddress === candidateAddress && sameCity && samePostal);
  if (existingAddress && candidateAddress) {
    if (sameAddress) matchedFields.push("address");
    else conflictingFields.push("address");
  }

  const existingPhoneLast4 = last4(existing.normalizedPhone);
  const candidatePhoneNormalized = normalizePhone(candidate.phone);
  const candidatePhoneLast4 = last4(candidatePhoneNormalized);
  const partialPhoneMatch = Boolean(existingPhoneLast4 && candidatePhoneLast4 && existingPhoneLast4 === candidatePhoneLast4);
  if (existingPhoneLast4 && candidatePhoneLast4) {
    if (partialPhoneMatch) matchedFields.push("phone (partial)");
    else conflictingFields.push("phone");
  }

  const existingEmailLocal = emailLocalPart(existing.normalizedEmail);
  const candidateEmailNormalized = normalizeEmail(candidate.email);
  const candidateEmailLocal = emailLocalPart(candidateEmailNormalized);
  const similarEmail = Boolean(
    existingEmailLocal && candidateEmailLocal && existingEmailLocal === candidateEmailLocal && existing.normalizedEmail !== candidateEmailNormalized,
  );
  if (similarEmail) matchedFields.push("email (similar)");

  // MEDIUM: similar name AND at least one corroborating signal.
  const hasCorroboratingSignal = sameAddress || partialPhoneMatch || similarEmail;
  if (nameSimilar && hasCorroboratingSignal) {
    const reasonParts = ["similar name"];
    if (sameAddress) reasonParts.push("same mailing address");
    if (partialPhoneMatch) reasonParts.push("matching last 4 phone digits");
    if (similarEmail) reasonParts.push("similar email address");
    return {
      confidence: "MEDIUM",
      score: Math.round(60 + nameSim * 20 + (matchedFields.length - 1) * 5),
      matchedFields,
      conflictingFields,
      reason: reasonParts.join(" + "),
    };
  }

  // LOW: name similarity alone, nothing corroborating — per spec, never
  // surfaced for review, never auto-merged. Reported so callers can log it
  // but the caller must treat LOW the same as NONE for review-queue purposes.
  if (nameSimilar) {
    return {
      confidence: "LOW",
      score: Math.round(nameSim * 40),
      matchedFields,
      conflictingFields,
      reason: "name similarity only — no corroborating field",
    };
  }

  return { confidence: "NONE", score: 0, matchedFields, conflictingFields, reason: "no meaningful similarity" };
}

/**
 * Scans a bounded candidate pool of existing donors and returns the
 * single best MEDIUM-confidence match, if any. Callers are responsible for
 * building a reasonably-sized candidate pool (e.g. donors sharing a city/
 * postal code, or the full active roster for a small organization) —
 * this function does not itself query the database.
 */
export function findBestScoredMatch(candidates: MatchCandidateDonor[], newDonor: NewDonorCandidateInput): { donor: MatchCandidateDonor; match: ScoredMatch } | null {
  let best: { donor: MatchCandidateDonor; match: ScoredMatch } | null = null;
  for (const donor of candidates) {
    const match = scoreDonorMatch(donor, newDonor);
    if (match.confidence !== "MEDIUM") continue;
    if (!best || match.score > best.match.score) best = { donor, match };
  }
  return best;
}
