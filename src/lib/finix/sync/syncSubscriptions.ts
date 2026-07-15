// TODO: FinixClient has no subscription methods yet, and WGC's subscription
// feature (ChurchSubscription) currently has no confirmed Finix subscription
// resource wired to it. Confirm the Finix subscription API before implementing.

import { prisma } from "@/lib/prisma";
import { redactFinixPayload } from "@/lib/finix/redact";

export async function syncSubscription(_finixSubscriptionId: string, _churchId?: string) {
  throw new Error(
    "syncSubscription is not implemented — Finix subscription API is unconfirmed. " +
      "See TODO in src/lib/finix/sync/syncSubscriptions.ts."
  );
}

/** Placeholder upsert shape, kept here so the FinixSubscription model has a documented writer. */
async function _upsertSubscription(subscription: any, churchId?: string) {
  await prisma.finixSubscription.upsert({
    where: { finixSubscriptionId: subscription.id },
    create: {
      finixSubscriptionId: subscription.id,
      churchId: churchId ?? null,
      finixMerchantId: subscription.merchant ?? null,
      finixBuyerIdentityId: subscription.buyer_identity ?? null,
      finixPaymentInstrumentId: subscription.payment_instrument ?? null,
      state: subscription.state ?? null,
      amountCents: subscription.amount ?? null,
      currency: subscription.currency ?? null,
      billingInterval: subscription.billing_interval ?? null,
      rawJsonRedacted: redactFinixPayload(subscription),
      createdAtFinix: subscription.created_at ? new Date(subscription.created_at) : null,
      updatedAtFinix: subscription.updated_at ? new Date(subscription.updated_at) : null,
    },
    update: {
      state: subscription.state ?? null,
      rawJsonRedacted: redactFinixPayload(subscription),
      updatedAtFinix: subscription.updated_at ? new Date(subscription.updated_at) : null,
    },
  });
}
