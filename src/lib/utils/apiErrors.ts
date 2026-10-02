/**
 * Client-side counterpart to src/lib/utils/errorNormalizer.ts's
 * toSafeErrorResponse(), which returns errors as an OBJECT —
 * { code, message, reference, title } — not a plain string. A client
 * component doing `data.error || "fallback"` after a failed fetch always
 * got the (always-truthy) object back, so the real message never
 * displayed — either nothing rendered, or React threw trying to render an
 * object as a JSX child, depending on the exact call site. Found while
 * investigating a merchant's "Could not create campaign" report, which
 * turned out to hide a specific, useful validation message this way; the
 * same bug existed in at least 3 other merchant forms calling other
 * toSafeErrorResponse-based routes.
 *
 * Some older routes still return error as a plain string
 * (NextResponse.json({ error: "..." })) — this handles both shapes so it's
 * safe to use regardless of which pattern the route it's calling follows.
 */
export function extractApiErrorMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") return fallback;
  const err = (data as { error?: unknown }).error;
  if (typeof err === "string" && err.trim()) return err;
  if (err && typeof err === "object" && typeof (err as { message?: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  return fallback;
}
