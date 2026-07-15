import { finixClient } from "@/lib/finix/client";
import { prisma } from "@/lib/prisma";
import { redactFinixPayload } from "@/lib/finix/redact";

function authFields(auth: any, voidedAt: Date | null) {
  return {
    finixPaymentInstrumentId: auth.source ?? null,
    finixBuyerIdentityId: auth.identity ?? null,
    state: auth.state ?? null,
    finixTransferId: auth.transfer ?? null,
    failureCode: auth.failure_code ?? null,
    failureMessage: auth.failure_message ?? null,
    isVoid: Boolean(auth.is_void),
    voidState: auth.void_state ?? null,
    voidedAt,
    traceId: auth.trace_id ?? null,
    cvvVerification: auth.security_code_verification ?? null,
    addressVerification: auth.address_verification ?? null,
    authorizationCode: auth.tags?.authorization_code ?? auth.authorization_code ?? null,
    tagsJson: auth.tags ?? null,
    rawJsonRedacted: redactFinixPayload(auth),
    updatedAtFinix: auth.updated_at ? new Date(auth.updated_at) : null,
    lastSyncedAt: new Date(),
  };
}

/**
 * Syncs all Authorizations for a merchant into FinixAuthorization.
 * Paginates through all results using Finix's HAL _links.next pattern.
 * Field names confirmed against Finix's Authorization resource.
 */
export async function syncAuthorizations(finixMerchantId: string, churchId?: string) {
  let created = 0;
  let updated = 0;
  let path: string | null = `/authorizations?merchant=${finixMerchantId}&limit=100`;

  while (path) {
    const response = await finixClient.listAuthorizationsPage(path);
    const authorizations: any[] = response?._embedded?.authorizations ?? [];

    for (const auth of authorizations) {
      const existing = await prisma.finixAuthorization.findUnique({
        where: { finixAuthorizationId: auth.id },
        select: { voidedAt: true },
      });
      const isVoid = Boolean(auth.is_void);
      const voidedAt = auth.voided_at
        ? new Date(auth.voided_at)
        : existing?.voidedAt ?? (isVoid ? (auth.updated_at ? new Date(auth.updated_at) : new Date()) : null);

      await prisma.finixAuthorization.upsert({
        where: { finixAuthorizationId: auth.id },
        create: {
          finixAuthorizationId: auth.id,
          churchId: churchId ?? null,
          finixMerchantId,
          amountCents: auth.amount ?? null,
          amountRequestedCents: auth.amount_requested ?? null,
          currency: auth.currency ?? null,
          expiresAt: auth.expires_at ? new Date(auth.expires_at) : null,
          createdAtFinix: auth.created_at ? new Date(auth.created_at) : null,
          ...authFields(auth, voidedAt),
        },
        update: authFields(auth, voidedAt),
      });

      if (existing) updated++;
      else created++;
    }

    const nextHref: string | undefined = response?._links?.next?.href;
    if (nextHref) {
      // Finix returns absolute URLs; strip the base to get the path.
      try {
        path = new URL(nextHref).pathname + new URL(nextHref).search;
      } catch {
        path = null;
      }
    } else {
      path = null;
    }
  }

  return { processed: created + updated, created, updated };
}
