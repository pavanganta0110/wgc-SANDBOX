import { withApiAuth } from "@/lib/api/withApiAuth";
import { apiError, apiSuccess } from "@/lib/api/response";
import { LEDGER_MAX_ROWS, loadLedgerRows } from "@/lib/ledger/loadLedger";

const MAX_WINDOW_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;

function parseInstant(raw: string | null): Date | null {
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Every gift in a date window in one call — the read for report runs and
 * annual statements, where paging a year of gifts with a cursor is
 * impractical. `from` is inclusive and `to` exclusive; a date-only value
 * (2026-01-01) is midnight UTC, so a full calendar year is
 * from=2026-01-01&to=2027-01-01. Includes external (cash, check) gifts as
 * source EXTERNAL rows. The church always comes from the API key.
 */
export const GET = withApiAuth("donations:read", async (req, auth, requestId) => {
  const { searchParams } = new URL(req.url);
  const from = parseInstant(searchParams.get("from"));
  const to = parseInstant(searchParams.get("to"));

  if (!from || !to) {
    return apiError("validation_error", "Both `from` and `to` are required, as dates (2026-01-01) or ISO timestamps.", requestId);
  }
  if (from >= to) {
    return apiError("validation_error", "`from` must be before `to`.", requestId);
  }
  if (to.getTime() - from.getTime() > MAX_WINDOW_DAYS * DAY_MS) {
    return apiError("validation_error", `The window can span at most ${MAX_WINDOW_DAYS} days.`, requestId);
  }

  const { rows, truncated } = await loadLedgerRows({ churchId: auth.churchId, from, to });
  if (truncated) {
    return apiError("validation_error", `That window holds more than ${LEDGER_MAX_ROWS} gifts. Narrow \`from\` and \`to\` and read it in parts.`, requestId, {
      rowLimit: LEDGER_MAX_ROWS,
    });
  }

  return apiSuccess(rows, requestId, { count: rows.length, from: from.toISOString(), to: to.toISOString() });
});
