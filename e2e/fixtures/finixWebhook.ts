import "./env";
import crypto from "crypto";

/**
 * Builds headers for a POST to /api/webhooks/finix that will pass the same
 * auth/signature verification real Finix webhooks go through (see
 * src/app/api/webhooks/finix/route.ts) — HMAC-signs the exact raw body
 * string using the same FINIX_WEBHOOK_SECRET the running dev server reads
 * from .env.local (loaded here directly by this test process; never
 * printed or logged), plus HTTP Basic auth if FINIX_WEBHOOK_BASIC_USERNAME/
 * PASSWORD are configured. Falls back to no auth headers if none of these
 * env vars are set, matching the route's own "no auth configured" bypass.
 */
export function buildFinixWebhookHeaders(rawBody: string): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  const basicUser = process.env.FINIX_WEBHOOK_BASIC_USERNAME || process.env.FINIX_WEBHOOK_USERNAME;
  const basicPass = process.env.FINIX_WEBHOOK_BASIC_PASSWORD || process.env.FINIX_WEBHOOK_PASSWORD;
  if (basicUser || basicPass) {
    headers["Authorization"] = `Basic ${Buffer.from(`${basicUser}:${basicPass}`).toString("base64")}`;
  }

  const bearer = process.env.FINIX_WEBHOOK_BEARER_TOKEN;
  if (bearer) {
    headers["Authorization"] = `Bearer ${bearer}`;
  }

  const secret = process.env.FINIX_WEBHOOK_SECRET || process.env.FINIX_WEBHOOK_SIGNING_KEY;
  if (secret) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = crypto
      .createHmac("sha256", secret)
      .update(`${timestamp}:${rawBody}`, "utf-8")
      .digest("hex");
    headers["finix-signature"] = `timestamp=${timestamp},sig=${signature}`;
  }

  return headers;
}

/** Realistic (fake-ID) merchant.updated APPROVED webhook payload — shape
 * matches getFinixEventData()'s expectations in the webhook route: a flat
 * `entity`/`type` pair and a `data` object carrying the merchant fields the
 * route reads (onboarding_state, status, processing_enabled,
 * settlement_enabled, id). */
export function buildMerchantApprovedPayload(params: { finixMerchantId: string; eventId?: string }) {
  return {
    id: params.eventId ?? `evt_e2e_${crypto.randomUUID()}`,
    entity: "MERCHANT",
    type: "updated",
    created_at: new Date().toISOString(),
    data: {
      id: params.finixMerchantId,
      onboarding_state: "APPROVED",
      status: "APPROVED",
      processing_enabled: true,
      settlement_enabled: true,
    },
  };
}

/** Realistic subscription-charge webhook payload — shape matches
 * handleWgcSubscriptionWebhookEvent()'s expectations in
 * src/lib/billing/wgcSubscriptionWebhook.ts (data.subscription,
 * data.amount, data.state). */
export function buildSubscriptionChargePayload(params: {
  finixSubscriptionId: string;
  succeeded: boolean;
  amountCents?: number;
  eventId?: string;
}) {
  return {
    id: params.eventId ?? `evt_e2e_${crypto.randomUUID()}`,
    entity: "TRANSFER",
    type: params.succeeded ? "succeeded" : "failed",
    created_at: new Date().toISOString(),
    data: {
      id: `TR_e2e_${crypto.randomUUID()}`,
      subscription: params.finixSubscriptionId,
      amount: params.amountCents ?? 1000,
      state: params.succeeded ? "SUCCEEDED" : "FAILED",
    },
  };
}
