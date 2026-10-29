import { apiError, apiSuccess } from "@/lib/api/response";
import { decodePartnerLedgerCursor, loadPartnerLedgerPage } from "@/lib/ledger/loadLedger";
import { withPartnerApiAuth } from "@/lib/partners/partnerApiAuth";
import { loadPartnerApiOrganizations, pickPartnerOrganization } from "@/lib/partners/loadPartnerApiOrganizations";

const MAX_WINDOW_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 1000;

function parseInstant(raw: string | null): Date | null {
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Every gift of the key's partner's organizations in a date window, oldest
 * first, in pages. Each row is the ledger row (same as GET /api/v1/ledger and
 * the donation.created webhook) plus `organization` {id, name, reference}.
 *
 * `from` is inclusive and `to` exclusive. Follow `nextCursor` until it is null.
 * `organization` (optional) limits the read to one of the partner's own
 * organizations, by WGC id or by the partner's reference; anything else is
 * rejected. Which organizations are readable always comes from the key.
 */
export const GET = withPartnerApiAuth(async (req, auth, requestId) => {
  const { searchParams } = new URL(req.url);
  const from = parseInstant(searchParams.get("from"));
  const to = parseInstant(searchParams.get("to"));
  if (!from || !to) {
    return apiError("validation_error", "Both `from` and `to` are required, as dates (2026-01-01) or ISO timestamps.", requestId);
  }
  if (from >= to) return apiError("validation_error", "`from` must be before `to`.", requestId);
  if (to.getTime() - from.getTime() > MAX_WINDOW_DAYS * DAY_MS) {
    return apiError("validation_error", `The window can span at most ${MAX_WINDOW_DAYS} days.`, requestId);
  }

  const rawLimit = Number(searchParams.get("limit"));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(MAX_LIMIT, Math.floor(rawLimit)) : DEFAULT_LIMIT;

  const rawCursor = searchParams.get("cursor");
  const cursor = rawCursor ? decodePartnerLedgerCursor(rawCursor) : null;
  if (rawCursor && !cursor) return apiError("validation_error", "`cursor` is not valid. Use the `nextCursor` from the previous page.", requestId);

  let organizations = await loadPartnerApiOrganizations(auth.partnerId);
  const requested = searchParams.get("organization");
  if (requested) {
    const one = pickPartnerOrganization(organizations, requested);
    if (!one) return apiError("not_found_error", "No organization of yours matches `organization`.", requestId);
    organizations = [one];
  }

  const { rows, nextCursor } = await loadPartnerLedgerPage({ organizations, from, to, cursor, limit });
  return apiSuccess(rows, requestId, { count: rows.length, nextCursor, from: from.toISOString(), to: to.toISOString() });
});
