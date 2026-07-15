export const WGC_INTERNAL_CATEGORY = "WGC_INTERNAL";

/**
 * Defense-in-depth guard: throws if ever invoked with a WGC_INTERNAL
 * document. Nothing in this codebase's Finix-facing code (identity payload
 * builder, payment instrument payload builder, merchant creation,
 * verification submission, webhook reconciliation, processor backfills)
 * currently references OnboardingInternalDocument at all — this function
 * exists so that if a future change accidentally wires a WGC-internal
 * document into any Finix-calling path, it fails loudly at that call site
 * instead of silently uploading the file to the processor. Call this at
 * the top of any new code path that touches finixClient and might ever
 * receive a document object.
 */
export function assertNeverSentToFinix(document: { category?: string | null } | null | undefined, context: string): void {
  if (document?.category === WGC_INTERNAL_CATEGORY) {
    throw new Error(`Refusing to send a WGC_INTERNAL document to Finix (context: ${context})`);
  }
}
