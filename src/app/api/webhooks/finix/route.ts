import { NextResponse } from "next/server";
import { headers } from "next/headers";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { sendWgcEmail, sendWgcAdminEmail } from "@/lib/email";
import { redactFinixPayload } from "@/lib/finix/redact";
import { parseFinixDate } from "@/lib/finix/parseFinixDate";
import { mapFinixDisputeStateToWgcStatus } from "@/lib/finix/statusMapping";
import { provisionChurchAccount } from "@/lib/auth/provisionChurchAccount";
import { syncPaymentInstrument } from "@/lib/finix/sync/syncPaymentInstruments";
import { syncFeesForTransfer } from "@/lib/finix/sync/syncFees";
import { linkTransfersToSettlement } from "@/lib/finix/sync/syncSettlements";
import { syncAllChurchesPricing, syncChurchPricingForMerchantProfile } from "@/lib/finix/sync/syncFeeProfiles";

const WEBHOOK_SECRET = process.env.FINIX_WEBHOOK_SECRET || process.env.FINIX_WEBHOOK_SIGNING_KEY;
const BEARER_TOKEN = process.env.FINIX_WEBHOOK_BEARER_TOKEN;
const BASIC_AUTH_USERNAME =
  process.env.FINIX_WEBHOOK_BASIC_USERNAME ||
  process.env.FINIX_WEBHOOK_USERNAME ||
  process.env.FINIX_WEBHOOK_BASIC_AUTH_USERNAME;
const BASIC_AUTH_PASSWORD =
  process.env.FINIX_WEBHOOK_BASIC_PASSWORD ||
  process.env.FINIX_WEBHOOK_PASSWORD ||
  process.env.FINIX_WEBHOOK_BASIC_AUTH_PASSWORD;

async function sendWebhookEmail(
  applicationId: string,
  type: string,
  to: string,
  subject: string,
  title: string,
  badgeText: string,
  badgeColor: string,
  bodyHtml: string
) {
  const existingLog = await prisma.emailLog.findFirst({
    where: { onboardingApplicationId: applicationId, type: type },
  });

  if (existingLog) {
    console.log(`Email of type ${type} already sent for application ${applicationId}`);
    return;
  }

  try {
    const response = await sendWgcEmail({ to, subject, title, badgeText, badgeColor, bodyHtml });
    const error = response.success ? null : response.error;
    const data = response.data;

    await prisma.emailLog.create({
      data: {
        onboardingApplicationId: applicationId,
        type: type,
        to: to,
        subject: subject,
        status: error ? "ERROR" : "SENT",
        providerMessageId: (data as any)?.data?.id || (data as any)?.id || null,
        error: error ? JSON.stringify(error) : null,
        sentAt: error ? null : new Date(),
      },
    });
  } catch (err) {
    console.error("Failed to send email:", err);
  }
}

function getFinixEventData(payload: any) {
  const entity = String(payload.entity || payload.data?.resource_type || "UNKNOWN").toUpperCase();
  const type = String(payload.type || "").toLowerCase();
  const data =
    payload.data ||
    payload._embedded?.merchants?.[0] ||
    payload._embedded?.identities?.[0] ||
    payload._embedded?.verifications?.[0] ||
    payload._embedded?.onboarding_forms?.[0] ||
    {};

  return { entity, type, data, eventType: `${entity.toLowerCase()}.${type}` };
}

async function resolveChurchIdForMerchant(finixMerchantId: string | null | undefined) {
  if (!finixMerchantId) return null;
  const church = await prisma.church.findFirst({ where: { finixMerchantId } });
  return church?.id ?? null;
}

async function findOnboardingApplicationForFinixEvent(data: any) {
  const finixIds = [
    data?.id,
    data?.merchant,
    data?.identity,
    data?.verification,
    data?.application,
  ].filter(Boolean);

  if (finixIds.length === 0) {
    return null;
  }

  return prisma.onboardingApplication.findFirst({
    where: {
      OR: [
      ...finixIds.flatMap((id) => [
          { finixIdentityId: id },
          { finixMerchantId: id },
          { finixVerificationId: id },
          { finixApplicationId: id },
        ]),
      ],
    },
  });
}

/**
 * Additive Finix data sync layer. Routes transfer/dispute/settlement events
 * into their own tables (FinixTransfer, FinixDispute, FinixSettlement) for
 * future reporting/admin dashboard use. Does not touch OnboardingApplication
 * or trigger any emails — that logic lives entirely in the existing
 * merchant/verification handling below and is untouched.
 *
 * TODO: fee.*, funding_transfer_attempt.*, and subscription.* events are not
 * yet routed here — see src/lib/finix/sync/{syncFees,syncPayouts,syncSubscriptions}.ts
 * for why (unconfirmed Finix API shapes).
 */
async function syncFinixDataFromWebhookEvent(
  entity: string,
  eventType: string,
  data: any,
  finixEventId: string,
  occurredAt: Date
) {
  if (entity === "TRANSFER" && data?.id) {
    const tags = data.tags ?? {};
    const source = tags.source === "wgc_giving_page" ? "wgc_giving_page" : "finix_dashboard";

    const church = data.merchant
      ? await prisma.church.findFirst({ where: { finixMerchantId: data.merchant } })
      : null;
    const churchId = church?.id ?? null;

    await prisma.finixTransfer.upsert({
      where: { finixTransferId: data.id },
      create: {
        finixTransferId: data.id,
        churchId,
        finixMerchantId: data.merchant ?? null,
        finixBuyerIdentityId: data.merchant_identity ?? null,
        finixPaymentInstrumentId: data.source ?? null,
        type: data.type ?? null,
        subtype: data.subtype ?? null,
        state: data.state ?? null,
        amountCents: data.amount ?? null,
        currency: data.currency ?? null,
        feeCents: data.fee ?? null,
        failureCode: data.failure_code ?? null,
        failureMessage: data.failure_message ?? null,
        traceId: data.trace_id ?? null,
        statementDescriptor: data.statement_descriptor ?? null,
        source,
        tagsJson: tags,
        rawJsonRedacted: redactFinixPayload(data),
        createdAtFinix: data.created_at ? new Date(data.created_at) : occurredAt,
        updatedAtFinix: data.updated_at ? new Date(data.updated_at) : occurredAt,
        lastSyncedAt: new Date(),
      },
      update: {
        churchId: churchId ?? undefined,
        state: data.state ?? null,
        failureCode: data.failure_code ?? null,
        failureMessage: data.failure_message ?? null,
        rawJsonRedacted: redactFinixPayload(data),
        updatedAtFinix: data.updated_at ? new Date(data.updated_at) : occurredAt,
        lastSyncedAt: new Date(),
      },
    });

    // Non-blocking: pull the buyer's payment instrument (+ linked donor
    // identity) and any processor fees now associated with this transfer.
    // Wrapped individually so a Finix API hiccup on one never drops the
    // other or blocks the transfer record itself from being saved above.
    if (data.source) {
      try {
        await syncPaymentInstrument(data.source, { churchId: churchId ?? undefined });
      } catch (err) {
        console.error("Payment instrument/donor sync failed:", err);
      }
    }
    try {
      await syncFeesForTransfer(data.id, churchId ?? undefined);
    } catch (err) {
      console.error("Fee sync failed:", err);
    }

    // A transfer of subtype REVERSAL/RETURN represents a refund/ACH return —
    // also record it in FinixRefundOrReversal, keyed by the reversal's own id.
    if (data.subtype === "REVERSAL" || data.type === "REVERSAL" || eventType.includes("reversal")) {
      await prisma.finixRefundOrReversal.upsert({
        where: { finixReversalId: data.id },
        create: {
          finixReversalId: data.id,
          churchId,
          finixOriginalTransferId: data.parent_transfer ?? null,
          finixMerchantId: data.merchant ?? null,
          amountCents: data.amount ?? null,
          currency: data.currency ?? null,
          state: data.state ?? null,
          failureCode: data.failure_code ?? null,
          failureMessage: data.failure_message ?? null,
          type: data.type ?? null,
          subtype: data.subtype ?? null,
          source,
          rawJsonRedacted: redactFinixPayload(data),
          createdAtFinix: data.created_at ? new Date(data.created_at) : occurredAt,
          updatedAtFinix: data.updated_at ? new Date(data.updated_at) : occurredAt,
          lastSyncedAt: new Date(),
        },
        update: {
          churchId: churchId ?? undefined,
          state: data.state ?? null,
          failureCode: data.failure_code ?? null,
          failureMessage: data.failure_message ?? null,
          rawJsonRedacted: redactFinixPayload(data),
          updatedAtFinix: data.updated_at ? new Date(data.updated_at) : occurredAt,
          lastSyncedAt: new Date(),
        },
      });
    }
    return;
  }

  if (entity === "DISPUTE" && data?.id) {
    const churchId = await resolveChurchIdForMerchant(data.merchant);

    await prisma.finixDispute.upsert({
      where: { finixDisputeId: data.id },
      create: {
        finixDisputeId: data.id,
        churchId,
        finixMerchantId: data.merchant ?? null,
        finixTransferId: data.transfer ?? null,
        state: mapFinixDisputeStateToWgcStatus(data.state),
        reason: data.reason ?? null,
        amountCents: data.amount ?? null,
        currency: data.currency ?? null,
        evidenceDueAt: data.evidence_due_at ? new Date(data.evidence_due_at) : null,
        respondedAt: data.responded_at ? new Date(data.responded_at) : null,
        resolvedAt: data.resolved_at ? new Date(data.resolved_at) : null,
        outcome: data.outcome ?? null,
        rawJsonRedacted: redactFinixPayload(data),
        createdAtFinix: data.created_at ? new Date(data.created_at) : occurredAt,
        updatedAtFinix: data.updated_at ? new Date(data.updated_at) : occurredAt,
        lastSyncedAt: new Date(),
      },
      update: {
        churchId: churchId ?? undefined,
        state: mapFinixDisputeStateToWgcStatus(data.state),
        evidenceDueAt: data.evidence_due_at ? new Date(data.evidence_due_at) : undefined,
        respondedAt: data.responded_at ? new Date(data.responded_at) : undefined,
        resolvedAt: data.resolved_at ? new Date(data.resolved_at) : undefined,
        outcome: data.outcome ?? undefined,
        rawJsonRedacted: redactFinixPayload(data),
        updatedAtFinix: data.updated_at ? new Date(data.updated_at) : occurredAt,
        lastSyncedAt: new Date(),
      },
    });
    return;
  }

  if (entity === "SETTLEMENT" && data?.id) {
    // Confirmed against a real GET /settlements/{id} response: the state
    // field is actually "status", the merchant is "merchant_id" (not
    // "merchant"), and the fee total is "total_fee"/"total_fees" — there's
    // no separate refund_amount/dispute_amount at the settlement level.
    const churchId = await resolveChurchIdForMerchant(data.merchant_id);

    await prisma.finixSettlement.upsert({
      where: { finixSettlementId: data.id },
      create: {
        finixSettlementId: data.id,
        churchId,
        finixMerchantId: data.merchant_id ?? null,
        state: data.status ?? null,
        totalAmountCents: data.total_amount ?? null,
        netAmountCents: data.net_amount ?? null,
        feeAmountCents: data.total_fee ?? data.total_fees ?? null,
        currency: data.currency ?? null,
        accruedAt: data.window_start_time ? new Date(data.window_start_time) : null,
        settledAt: data.status === "SETTLED" && data.updated_at ? new Date(data.updated_at) : null,
        rawJsonRedacted: redactFinixPayload(data),
        createdAtFinix: data.created_at ? new Date(data.created_at) : occurredAt,
        updatedAtFinix: data.updated_at ? new Date(data.updated_at) : occurredAt,
        lastSyncedAt: new Date(),
      },
      update: {
        churchId: churchId ?? undefined,
        state: data.status ?? null,
        totalAmountCents: data.total_amount ?? null,
        netAmountCents: data.net_amount ?? null,
        feeAmountCents: data.total_fee ?? data.total_fees ?? null,
        settledAt: data.status === "SETTLED" && data.updated_at ? new Date(data.updated_at) : undefined,
        rawJsonRedacted: redactFinixPayload(data),
        updatedAtFinix: data.updated_at ? new Date(data.updated_at) : occurredAt,
        lastSyncedAt: new Date(),
      },
    });

    try {
      await linkTransfersToSettlement(data.id);
    } catch (err) {
      console.error("Failed to link transfers to settlement:", err);
    }
    return;
  }

  if ((entity === "FUNDING_TRANSFER_ATTEMPT" || entity === "FUNDING_INSTRUMENT") && data?.id) {
    const churchId = await resolveChurchIdForMerchant(data.merchant);

    await prisma.finixFundingTransferAttempt.upsert({
      where: { finixFundingTransferAttemptId: data.id },
      create: {
        finixFundingTransferAttemptId: data.id,
        churchId,
        finixMerchantId: data.merchant ?? null,
        finixSettlementId: data.settlement ?? null,
        state: data.state ?? null,
        amountCents: data.amount ?? null,
        currency: data.currency ?? null,
        bankAccountLast4: data.masked_account_number ?? null,
        bankAccountType: data.account_type ?? null,
        failureCode: data.failure_code ?? null,
        failureMessage: data.failure_message ?? null,
        estimatedArrivalDate: data.estimated_arrival_date ? new Date(data.estimated_arrival_date) : null,
        sentAt: data.sent_at ? new Date(data.sent_at) : null,
        arrivedAt: data.arrived_at ? new Date(data.arrived_at) : null,
        rawJsonRedacted: redactFinixPayload(data),
        createdAtFinix: data.created_at ? new Date(data.created_at) : occurredAt,
        updatedAtFinix: data.updated_at ? new Date(data.updated_at) : occurredAt,
        lastSyncedAt: new Date(),
      },
      update: {
        churchId: churchId ?? undefined,
        state: data.state ?? null,
        failureCode: data.failure_code ?? null,
        failureMessage: data.failure_message ?? null,
        sentAt: data.sent_at ? new Date(data.sent_at) : undefined,
        arrivedAt: data.arrived_at ? new Date(data.arrived_at) : undefined,
        rawJsonRedacted: redactFinixPayload(data),
        updatedAtFinix: data.updated_at ? new Date(data.updated_at) : occurredAt,
        lastSyncedAt: new Date(),
      },
    });
    return;
  }

  if (entity === "SUBSCRIPTION" && data?.id) {
    // Confirmed against a real GET /subscriptions/{id} response: the
    // merchant is under linked_to (not merchant), buyer identity/instrument
    // are nested under buyer_details, and the field is billing_interval
    // (not interval).
    const churchId = await resolveChurchIdForMerchant(data.linked_to);

    await prisma.finixSubscription.upsert({
      where: { finixSubscriptionId: data.id },
      create: {
        finixSubscriptionId: data.id,
        churchId,
        finixMerchantId: data.linked_to ?? null,
        finixBuyerIdentityId: data.buyer_details?.identity_id ?? null,
        finixPaymentInstrumentId: data.buyer_details?.instrument_id ?? null,
        state: data.state ?? null,
        amountCents: data.amount ?? null,
        currency: data.currency ?? null,
        billingInterval: data.billing_interval ?? null,
        collectionMethod: data.subscription_details?.collection_method ?? null,
        nextBillingDate: parseFinixDate(data.next_billing_date),
        startedAt: data.start_subscription_at ? new Date(data.start_subscription_at) : occurredAt,
        canceledAt: data.canceled_at ? new Date(data.canceled_at) : null,
        rawJsonRedacted: redactFinixPayload(data),
        createdAtFinix: data.created_at ? new Date(data.created_at) : occurredAt,
        updatedAtFinix: data.updated_at ? new Date(data.updated_at) : occurredAt,
        lastSyncedAt: new Date(),
      },
      update: {
        churchId: churchId ?? undefined,
        state: data.state ?? null,
        nextBillingDate: parseFinixDate(data.next_billing_date) ?? undefined,
        canceledAt: data.canceled_at ? new Date(data.canceled_at) : undefined,
        rawJsonRedacted: redactFinixPayload(data),
        updatedAtFinix: data.updated_at ? new Date(data.updated_at) : occurredAt,
        lastSyncedAt: new Date(),
      },
    });
    return;
  }

  if (entity === "AUTHORIZATION" && data?.id) {
    const churchId = await resolveChurchIdForMerchant(data.merchant);

    await prisma.finixAuthorization.upsert({
      where: { finixAuthorizationId: data.id },
      create: {
        finixAuthorizationId: data.id,
        churchId,
        finixMerchantId: data.merchant ?? null,
        finixTransferId: data.transfer ?? null,
        state: data.state ?? null,
        amountCents: data.amount ?? null,
        amountRequestedCents: data.amount_requested ?? null,
        currency: data.currency ?? null,
        failureCode: data.failure_code ?? null,
        failureMessage: data.failure_message ?? null,
        isVoid: Boolean(data.is_void),
        voidState: data.void_state ?? null,
        expiresAt: data.expires_at ? new Date(data.expires_at) : null,
        rawJsonRedacted: redactFinixPayload(data),
        createdAtFinix: data.created_at ? new Date(data.created_at) : occurredAt,
        updatedAtFinix: data.updated_at ? new Date(data.updated_at) : occurredAt,
        lastSyncedAt: new Date(),
      },
      update: {
        churchId: churchId ?? undefined,
        state: data.state ?? null,
        finixTransferId: data.transfer ?? null,
        failureCode: data.failure_code ?? null,
        failureMessage: data.failure_message ?? null,
        isVoid: Boolean(data.is_void),
        voidState: data.void_state ?? null,
        rawJsonRedacted: redactFinixPayload(data),
        updatedAtFinix: data.updated_at ? new Date(data.updated_at) : occurredAt,
        lastSyncedAt: new Date(),
      },
    });
    return;
  }

  if (entity === "FEE" && data?.id) {
    // Confirmed against a real GET /fees response: linked_id/linked_to
    // identify what the fee is attached to, merchant is the flat merchant
    // id. Handling this directly from the webhook payload avoids the race
    // condition in re-querying GET /fees?linked_to= right when
    // transfer.created fires — Finix doesn't always have the fee records
    // computed and queryable that fast yet.
    const churchId = await resolveChurchIdForMerchant(data.merchant);

    await prisma.finixFee.upsert({
      where: { finixFeeId: data.id },
      create: {
        finixFeeId: data.id,
        churchId,
        linkedToId: data.linked_id ?? null,
        linkedToType: data.linked_to ?? null,
        feeType: data.fee_type ?? data.category ?? null,
        amountCents: data.amount ?? null,
        currency: data.currency ?? null,
        description: data.display_name ?? data.label ?? null,
        rawJsonRedacted: redactFinixPayload(data),
        createdAtFinix: data.created_at ? new Date(data.created_at) : occurredAt,
        updatedAtFinix: data.updated_at ? new Date(data.updated_at) : occurredAt,
      },
      update: {
        churchId: churchId ?? undefined,
        feeType: data.fee_type ?? data.category ?? null,
        amountCents: data.amount ?? null,
        rawJsonRedacted: redactFinixPayload(data),
        updatedAtFinix: data.updated_at ? new Date(data.updated_at) : occurredAt,
      },
    });
    return;
  }

  if (entity === "FEE_PROFILE" && data?.id) {
    // Fee profiles don't say which merchants use them, so a rate change on
    // the shared/default profile can affect any church — refresh them all.
    // Fine at current scale (see syncAllChurchesPricing for details).
    try {
      await syncAllChurchesPricing();
    } catch (err) {
      console.error("Failed to sync church pricing after fee_profile event:", err);
    }
    return;
  }

  if (entity === "MERCHANT_PROFILE" && data?.id) {
    try {
      await syncChurchPricingForMerchantProfile(data.id);
    } catch (err) {
      console.error("Failed to sync church pricing after merchant_profile event:", err);
    }
    return;
  }

  // Everything else (merchant, identity, verification, instrument, and any
  // event type not yet wired into the additive sync layer) is archived as-is
  // for future backfill/debugging, redacted for safety.
  await prisma.finixRawEventArchive.upsert({
    where: { finixEventId },
    create: {
      finixEventId,
      entity,
      eventType,
      resourceId: data?.id ?? null,
      finixMerchantId: data?.merchant ?? (entity === "MERCHANT" ? data?.id : null),
      payloadRedactedJson: redactFinixPayload(data ?? {}),
      processedAt: new Date(),
      processingStatus: "COMPLETED",
    },
    update: {
      payloadRedactedJson: redactFinixPayload(data ?? {}),
      processedAt: new Date(),
      processingStatus: "COMPLETED",
    },
  });
}

export async function POST(req: Request) {
  try {
    const headerList = await headers();
    const signatureHeader = headerList.get("finix-signature");
    const authHeader = headerList.get("authorization") || "";
    const rawBody = await req.text();
    const authConfigured = Boolean(BEARER_TOKEN || BASIC_AUTH_USERNAME || BASIC_AUTH_PASSWORD);

    if (!authConfigured && !WEBHOOK_SECRET) {
      return NextResponse.json(
        { error: "Unauthorized: No authentication configured" },
        { status: 401 }
      );
    }

    if (authConfigured) {
      const authChecks: { name: string; valid: boolean }[] = [];

      if (BEARER_TOKEN) {
        const match = authHeader.match(/^Bearer\s+(.*)$/i);
        authChecks.push({
          name: "Bearer",
          valid: Boolean(match && match[1] === BEARER_TOKEN),
        });
      }

      if (BASIC_AUTH_USERNAME || BASIC_AUTH_PASSWORD) {
        const match = authHeader.match(/^Basic\s+(.*)$/i);
        let basicValid = false;

        if (match) {
          try {
            const decoded = Buffer.from(match[1], "base64").toString("utf8");
            const separatorIndex = decoded.indexOf(":");
            const username = separatorIndex >= 0 ? decoded.slice(0, separatorIndex) : "";
            const password = separatorIndex >= 0 ? decoded.slice(separatorIndex + 1) : "";

            basicValid = username === BASIC_AUTH_USERNAME && password === BASIC_AUTH_PASSWORD;
          } catch {
            basicValid = false;
          }
        }

        authChecks.push({
          name: "Basic",
          valid: basicValid,
        });
      }

      if (!authChecks.some((check) => check.valid)) {
        return NextResponse.json(
          { error: "Unauthorized: Invalid authentication" },
          { status: 401 }
        );
      }
    }

    if (WEBHOOK_SECRET) {
      if (!signatureHeader) {
        return NextResponse.json(
          { error: "Unauthorized: Missing Signature" },
          { status: 401 }
        );
      }

      const sigParts = signatureHeader.split(",");
      let timestamp = "";
      let signature = "";
      for (const part of sigParts) {
        const [key, value] = part.trim().split("=");
        if (key === "timestamp") timestamp = value;
        if (key === "sig") signature = value;
      }

      if (!timestamp || !signature) {
        return NextResponse.json(
          { error: "Unauthorized: Invalid Signature Format" },
          { status: 401 }
        );
      }

      const payloadToSign = `${timestamp}:${rawBody}`;
      const expectedSignature = crypto
        .createHmac("sha256", WEBHOOK_SECRET)
        .update(payloadToSign, "utf-8")
        .digest("hex");

      if (signature.length !== expectedSignature.length) {
        return NextResponse.json(
          { error: "Unauthorized: Invalid Signature" },
          { status: 401 }
        );
      }

      if (
        !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
      ) {
        return NextResponse.json(
          { error: "Unauthorized: Invalid Signature" },
          { status: 401 }
        );
      }

      const eventTime = parseInt(timestamp, 10);
      const now = Math.floor(Date.now() / 1000);

      if (Number.isNaN(eventTime) || Math.abs(now - eventTime) > 300) {
        return NextResponse.json(
          { error: "Unauthorized: Timestamp too old" },
          { status: 401 }
        );
      }
    }

    const payload = JSON.parse(rawBody);
    const { entity, eventType, data } = getFinixEventData(payload);
    const eventId = payload.id;
    const occurredAt = payload.created_at ? new Date(payload.created_at) : new Date();

    let identityId = data?.identity;
    let merchantId = data?.merchant;
    if (!merchantId && entity === "MERCHANT") {
      merchantId = data?.id;
    }
    if (!identityId && entity === "IDENTITY") {
      identityId = data?.id;
    }

    const verificationId = entity === "VERIFICATION" ? data?.id : undefined;

    const existingEvent = await prisma.finixWebhookEvent.findUnique({
      where: { finixEventId: eventId },
    });

    if (existingEvent) {
      return NextResponse.json({ message: "Already processed" }, { status: 200 });
    }

    const webhookEvent = await prisma.finixWebhookEvent.create({
      data: {
        finixEventId: eventId,
        entity,
        type: eventType,
        occurredAt,
        merchantId: merchantId || null,
        identityId: identityId || null,
        verificationId: verificationId || null,
        rawPayloadJson: payload,
      },
    });

    // Additive Finix data sync layer — stores transfers/disputes/settlements
    // into their own tables for future reporting/admin dashboard use. This
    // is independent of and does not affect the onboarding status logic
    // below. We always return 200 to Finix regardless of outcome here, so
    // Finix will never retry a failure on our end (e.g. a transient DB
    // connection blip) — a couple of quick retries plus a durable failure
    // record (instead of just a log line that scrolls away) are the only
    // safety net for that.
    let syncSucceeded = false;
    let lastSyncError: unknown;
    for (let attempt = 1; attempt <= 3 && !syncSucceeded; attempt++) {
      try {
        await syncFinixDataFromWebhookEvent(entity, eventType, data, eventId, occurredAt);
        syncSucceeded = true;
      } catch (syncError) {
        lastSyncError = syncError;
        console.error(`Finix data sync (additive layer) failed, attempt ${attempt}/3:`, syncError);
        if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 300));
      }
    }
    if (!syncSucceeded) {
      await prisma.finixRawEventArchive.upsert({
        where: { finixEventId: eventId },
        create: {
          finixEventId: eventId,
          entity,
          eventType,
          resourceId: data?.id ?? null,
          finixMerchantId: data?.merchant ?? data?.linked_to ?? null,
          payloadRedactedJson: redactFinixPayload(data ?? {}),
          processingStatus: "FAILED",
          errorMessage: lastSyncError instanceof Error ? lastSyncError.message : String(lastSyncError),
        },
        update: {
          processingStatus: "FAILED",
          errorMessage: lastSyncError instanceof Error ? lastSyncError.message : String(lastSyncError),
        },
      }).catch((archiveError) => console.error("Failed to record sync failure:", archiveError));
    }

    try {
      const app = await findOnboardingApplicationForFinixEvent(data);

      if (!app) {
        await prisma.finixWebhookEvent.update({
          where: { id: webhookEvent.id },
          data: { processedAt: new Date(), processingStatus: "COMPLETED" },
        });

        return NextResponse.json(
          { message: "Webhook recorded (no matching onboarding app)" },
          { status: 200 }
        );
      }

      const contactEmail = app.contactEmail;
      const orgName = app.legalBusinessName || app.organizationName;
      const safeOrgName = orgName || "your organization";

      const updateData: any = {
        lastFinixEventId: eventId,
        lastFinixEventType: eventType,
        lastWebhookPayloadSummary: { type: eventType, entity, status: data?.status, state: data?.state, onboarding_state: data?.onboarding_state }
      };

      if (eventType === "merchant.created") {
        const onboardingState = data?.onboarding_state;
        if (onboardingState === "PROVISIONING") {
          if (app.onboardingStatus !== "APPROVED" && app.onboardingStatus !== "REJECTED") {
            updateData.onboardingStatus = "UNDER_REVIEW";
            updateData.finixMerchantId = data.id;
            updateData.lastStatusChangedAt = new Date();
          }
        }
      } else if (eventType === "merchant.underwritten" || eventType === "merchant.updated") {
        const onboardingState = data?.onboarding_state;
        const status = data?.status;

        if (onboardingState === "APPROVED" || status === "APPROVED") {
          const wasAlreadyApproved = app.onboardingStatus === "APPROVED";
          updateData.onboardingStatus = "APPROVED";
          updateData.onboardingState = "APPROVED";
          updateData.processingEnabled = data?.processing_enabled || false;
          updateData.settlementEnabled = data?.settlement_enabled || false;
          if (!wasAlreadyApproved) {
            updateData.lastStatusChangedAt = new Date();
            updateData.approvedAt = new Date();
          }

          await sendWebhookEmail(
            app.id,
            "APPROVED",
            contactEmail,
            "Your WGC Payments account has been approved",
            "Your account has been approved",
            "Approved",
            "#10B981",
            `<p>Hi ${safeOrgName},</p>
             <p>Great news — your WGC Payments account has been approved.</p>
             <p>Your merchant account is now approved for payment processing. You will receive a separate secure dashboard access email with instructions to log in and set or reset your password.</p>`
          );

          await sendWgcAdminEmail({
            merchantName: safeOrgName,
            contactEmail,
            finixMerchantId: app.finixMerchantId || data.id,
            finixIdentityId: app.finixIdentityId || undefined,
            newStatus: "APPROVED",
            whatHappened: "Finix approved the merchant onboarding application.",
            actionNeeded: "None.",
            adminDashboardLink: "https://wgcpayments.com/admin/merchant-applications"
          });

          // Provision the Church row + church_admin User account and send
          // the separate "secure dashboard access" email referenced above.
          // Wrapped so a failure here never blocks the approval flow itself.
          try {
            await provisionChurchAccount({
              id: app.id,
              organizationName: app.organizationName,
              legalBusinessName: app.legalBusinessName,
              contactEmail: app.contactEmail,
              contactName: app.contactName,
              finixMerchantId: app.finixMerchantId || data.id,
              finixIdentityId: app.finixIdentityId,
              finixApplicationId: app.finixApplicationId,
            });
          } catch (provisionError) {
            console.error("Failed to provision church dashboard account:", provisionError);
          }
        } else if (onboardingState === "UPDATE_REQUESTED") {
          if (app.onboardingStatus !== "MORE_INFORMATION_REQUIRED" && app.onboardingStatus !== "APPROVED") {
            updateData.onboardingStatus = "MORE_INFORMATION_REQUIRED";
            updateData.onboardingState = "UPDATE_REQUESTED";
            updateData.lastStatusChangedAt = new Date();
            updateData.updateRequestedAt = new Date();

            const rawToken = crypto.randomBytes(32).toString("hex");
            const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 7);

            updateData.updateTokenHash = tokenHash;
            updateData.updateTokenExpiresAt = expiresAt;

            let requestedItemsStr = "Additional documentation is required to verify your business and identity.";
            if (data?.messages) {
              updateData.updateRequestedCodes = data.messages;
              try {
                const msgs = Array.isArray(data.messages) ? data.messages : [data.messages];
                const items = msgs.map((m: any) => typeof m === "object" ? (m.message || m.code || JSON.stringify(m)) : m);
                if (items.length > 0) {
                  requestedItemsStr = items.map((i: string) => `• ${i}`).join("<br/>");
                  updateData.updateRequestedItems = requestedItemsStr;
                }
              } catch (e) {
                console.error("Failed to parse requested items:", e);
              }
            }

            const secureLink = `https://wgcpayments.com/onboarding/update/${rawToken}`;

            await sendWebhookEmail(
              app.id,
              "MORE_INFORMATION_REQUIRED",
              contactEmail,
              "Additional information needed for your WGC Payments account",
              "Additional information is required",
              "Action Required",
              "#F59E0B",
              `<p>We need additional information to continue reviewing your WGC Payments account for <strong>${safeOrgName}</strong>.</p>
               <p><strong>Requested items:</strong><br/>${requestedItemsStr}</p>
               <p>Please use the secure link below to submit the requested information.</p>
               <p><a href="${secureLink}">Submit Required Information</a></p>`
            );

            await sendWgcAdminEmail({
              merchantName: safeOrgName,
              contactEmail,
              finixMerchantId: app.finixMerchantId || data.id,
              newStatus: "MORE_INFORMATION_REQUIRED",
              whatHappened: "Finix requested additional information or documents for the merchant.",
              actionNeeded: "Merchant has been sent a secure upload link.",
              adminDashboardLink: "https://wgcpayments.com/admin/merchant-applications"
            });
          }
        } else if (onboardingState === "REJECTED" || status === "REJECTED" || status === "FAILED") {
          const wasAlreadyRejected = app.onboardingStatus === "REJECTED";
          updateData.onboardingStatus = "REJECTED";
          updateData.onboardingState = "REJECTED";
          if (!wasAlreadyRejected) {
            updateData.lastStatusChangedAt = new Date();
            updateData.rejectedAt = new Date();
          }

          await sendWebhookEmail(
            app.id,
            "REJECTED",
            contactEmail,
            "Update on your WGC Payments application",
            "Update on your application",
            "Not Approved",
            "#EF4444",
            `<p>Thank you for your interest in WGC Payments.</p><p>After review, we are unable to approve the onboarding application for <strong>${safeOrgName}</strong> at this time.</p><p>If you believe this was a mistake or would like more information, please contact WGC Payments Support.</p>`
          );

          await sendWgcAdminEmail({
            merchantName: safeOrgName,
            contactEmail,
            finixMerchantId: app.finixMerchantId || data.id,
            newStatus: "REJECTED",
            whatHappened: "Finix rejected the merchant onboarding application.",
            actionNeeded: "Review rejection reason in Finix. Contact merchant if needed.",
            adminDashboardLink: "https://wgcpayments.com/admin/merchant-applications"
          });
        }
      } else if (eventType === "verification.created") {
        const state = data?.state;
        if (state === "PENDING") {
          updateData.finixVerificationId = data.id;
          updateData.verificationState = "PENDING";
          if (app.onboardingStatus !== "APPROVED" && app.onboardingStatus !== "REJECTED") {
            updateData.onboardingStatus = "UNDER_REVIEW";
          }
        }
      } else if (eventType === "verification.updated") {
        const state = data?.state;
        updateData.verificationState = state;

        if (state === "SUCCEEDED") {
          if (app.onboardingStatus === "UNDER_REVIEW") {
            updateData.onboardingStatus = "UNDER_REVIEW";
          }
        } else if (state === "FAILED") {
          // Save but don't transition merchant status to failed immediately, rely on merchant.updated
        }
      }

      await prisma.onboardingApplication.update({
        where: { id: app.id },
        data: updateData
      });

      await prisma.finixWebhookEvent.update({
        where: { id: webhookEvent.id },
        data: { processedAt: new Date(), processingStatus: "COMPLETED" },
      });

      return NextResponse.json({ success: true });
    } catch (processError: any) {
      await prisma.finixWebhookEvent.update({
        where: { id: webhookEvent.id },
        data: { processingStatus: "ERROR", errorMessage: processError.message },
      });
      
      // Send admin alert for failed webhook processing
      await sendWgcAdminEmail({
        merchantName: "System Alert",
        contactEmail: "N/A",
        newStatus: "WEBHOOK_FAILED",
        whatHappened: `Failed to process webhook event: ${eventType} (${eventId})`,
        actionNeeded: `Check logs. Error: ${processError.message}`,
        adminDashboardLink: "https://wgcpayments.com/admin/merchant-applications"
      });

      throw processError;
    }
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
