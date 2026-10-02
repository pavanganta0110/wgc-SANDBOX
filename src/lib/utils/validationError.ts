import { NextResponse } from "next/server";

/**
 * Returns a validation message to the client EXACTLY as written — never
 * toSafeErrorResponse (src/lib/utils/errorNormalizer.ts) for this purpose.
 * That helper runs every message through normalizeUserFacingError(), which
 * pattern-matches against known Finix/refund error substrings and replaces
 * anything it doesn't recognize with a generic "We could not complete your
 * request... reference WGC-XXXXXX" message. That's the right behavior for
 * a RAW, potentially-unsafe error caught from Finix/Prisma/etc (the whole
 * point is to never leak processor internals) — but it was never meant for
 * deliberate, hand-written, already-safe strings like "Campaign name is
 * required" or "Goal amount is too large — the maximum supported goal is
 * $21,474,836.47.". Routed through the sanitizer, EVERY one of those
 * became the same unhelpful generic message, with the real, useful text
 * only ever reaching a server log — found while investigating a merchant's
 * "Could not create campaign" report that turned out to be hiding a
 * specific, correct validation message this exact way.
 *
 * Same { error: { code, message } } response shape toSafeErrorResponse
 * uses, so existing client code (and extractApiErrorMessage in
 * src/lib/utils/apiErrors.ts) reads it identically either way.
 */
export function validationError(message: string, status = 400) {
  return NextResponse.json({ error: { code: "VALIDATION_ERROR", message } }, { status });
}
