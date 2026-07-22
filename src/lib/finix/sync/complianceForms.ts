import { prisma } from "@/lib/prisma";
import { finixClient } from "@/lib/finix/client";

/**
 * Webhooks must not be the only sync path — this reconciliation fallback
 * mirrors the pattern already established for subscriptions/payments
 * (subscriptionReconciliation.ts / paymentReconciliation.ts).
 */
export const COMPLIANCE_RECONCILE_THROTTLE_MS = 60 * 60 * 1000; // 1 hour — compliance state changes rarely

export function isStaleEnoughToReconcile(lastReconciledAt: Date | null | undefined): boolean {
  return !lastReconciledAt || Date.now() - lastReconciledAt.getTime() > COMPLIANCE_RECONCILE_THROTTLE_MS;
}

function parseFinixTimestamp(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Maps a raw Finix `compliance_form` resource onto our persisted fields. */
export function mapFinixComplianceForm(raw: any) {
  const signature = raw.pci_saq_a || {};
  return {
    type: String(raw.type || "PCI_SAQ_A"),
    version: raw.version ?? null,
    state: String(raw.state || "INCOMPLETE").toUpperCase(),
    dueAt: parseFinixTimestamp(raw.due_at),
    validFrom: parseFinixTimestamp(raw.valid_from),
    validUntil: parseFinixTimestamp(raw.valid_until),
    unsignedFileId: raw.files?.unsigned_file ?? null,
    signedFileId: raw.files?.signed_file ?? null,
    signeeName: signature.name ?? null,
    signeeTitle: signature.title ?? null,
    signeeIpAddress: signature.ip_address ?? null,
    signeeUserAgent: signature.user_agent ?? null,
    signedAt: parseFinixTimestamp(signature.signed_at),
    isAccepted: Boolean(signature.is_accepted),
    createdAtFinix: parseFinixTimestamp(raw.created_at),
    updatedAtFinix: parseFinixTimestamp(raw.updated_at),
  };
}

export async function upsertComplianceFormFromFinix(churchId: string, finixMerchantId: string, raw: any) {
  const mapped = mapFinixComplianceForm(raw);
  return prisma.complianceForm.upsert({
    where: { finixComplianceFormId: raw.id },
    create: {
      finixComplianceFormId: raw.id,
      churchId,
      finixMerchantId,
      ...mapped,
      lastReconciledAt: new Date(),
    },
    update: {
      ...mapped,
      lastReconciledAt: new Date(),
    },
  });
}

export const SYNC_TYPES = {
  FINIX_COMPLIANCE_FORMS: "FINIX_COMPLIANCE_FORMS",
} as const;

export const COMPLIANCE_SYNC_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
export const COMPLIANCE_SYNC_RETRY_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
export const COMPLIANCE_SYNC_LEASE_MS = 30 * 1000; // 30 seconds lock lease

/**
 * Self-healing fallback: fetches any Compliance Forms Finix has on file for
 * this merchant that we don't already have locally (or haven't refreshed
 * recently), independent of whether their creation/update webhook ever
 * arrived. Throttled + read-mostly, safe to call on every dashboard load.
 */
export async function reconcileComplianceFormsForChurch(churchId: string): Promise<void> {
  const church = await prisma.church.findUnique({ where: { id: churchId } });
  if (!church?.finixMerchantId) return;

  const now = new Date();
  const state = await prisma.synchronizationState.findUnique({
    where: { churchId_syncType: { churchId, syncType: SYNC_TYPES.FINIX_COMPLIANCE_FORMS } }
  });

  if (state) {
    // 1. Success throttle (1 hour)
    if (state.lastSuccessfulAt && now.getTime() - state.lastSuccessfulAt.getTime() < COMPLIANCE_SYNC_COOLDOWN_MS) {
      return;
    }
    // 2. Retry throttle (5 minutes)
    if (state.lastErrorAt && (!state.lastSuccessfulAt || state.lastErrorAt > state.lastSuccessfulAt) && now.getTime() - state.lastErrorAt.getTime() < COMPLIANCE_SYNC_RETRY_COOLDOWN_MS) {
      return;
    }
    // 3. Concurrency lease lock check (30 seconds)
    if (state.lockedUntil && now.getTime() < state.lockedUntil.getTime()) {
      return;
    }
  }

  // Acquire the concurrency lease lock atomically
  const lockedUntil = new Date(now.getTime() + COMPLIANCE_SYNC_LEASE_MS);
  const affected = await prisma.synchronizationState.updateMany({
    where: {
      churchId,
      syncType: SYNC_TYPES.FINIX_COMPLIANCE_FORMS,
      OR: [
        { lockedUntil: null },
        { lockedUntil: { lte: now } }
      ]
    },
    data: {
      lockedUntil,
      lastAttemptedAt: now
    }
  });

  if (affected.count === 0) {
    try {
      await prisma.synchronizationState.create({
        data: {
          churchId,
          syncType: SYNC_TYPES.FINIX_COMPLIANCE_FORMS,
          lockedUntil,
          lastAttemptedAt: now
        }
      });
    } catch (err) {
      return;
    }
  }

  // Double-checked lock validation: reload the state to verify if a concurrent process completed a fresh sync
  const freshState = await prisma.synchronizationState.findUnique({
    where: { churchId_syncType: { churchId, syncType: SYNC_TYPES.FINIX_COMPLIANCE_FORMS } }
  });
  if (freshState && freshState.lastSuccessfulAt && new Date().getTime() - freshState.lastSuccessfulAt.getTime() < COMPLIANCE_SYNC_COOLDOWN_MS) {
    await prisma.synchronizationState.update({
      where: { churchId_syncType: { churchId, syncType: SYNC_TYPES.FINIX_COMPLIANCE_FORMS } },
      data: { lockedUntil: null }
    });
    return;
  }

  try {
    const response = await finixClient.listComplianceFormsForMerchant(church.finixMerchantId);
    const forms = response?._embedded?.compliance_forms || [];
    for (const raw of forms) {
      await upsertComplianceFormFromFinix(churchId, church.finixMerchantId!, raw);
    }

    // Success: Update synchronization state
    await prisma.synchronizationState.update({
      where: { churchId_syncType: { churchId, syncType: SYNC_TYPES.FINIX_COMPLIANCE_FORMS } },
      data: {
        lastSuccessfulAt: new Date(),
        resultCount: forms.length,
        lastErrorAt: null,
        lastErrorCode: null,
        lockedUntil: null
      }
    });
  } catch (err) {
    console.error("Compliance form reconciliation failed", { churchId, error: err });
    const errorCode = err instanceof Error ? err.name || err.message : String(err);
    const sanitizedCode = errorCode.substring(0, 100);

    // Failure: Record error and release the lock to observe retry cooldown
    await prisma.synchronizationState.update({
      where: { churchId_syncType: { churchId, syncType: SYNC_TYPES.FINIX_COMPLIANCE_FORMS } },
      data: {
        lastErrorAt: new Date(),
        lastErrorCode: sanitizedCode,
        lockedUntil: null
      }
    });
  }
}

export interface ComplianceStatus {
  state: string;
  isOverdue: boolean;
  isComplete: boolean;
  daysUntilDue: number | null;
  needsAttention: boolean;
}

/** Pure — never guesses; a form with no dueAt simply has no urgency signal. */
export function resolveComplianceStatus(form: { state: string; dueAt: Date | null } | null, now: number = Date.now()): ComplianceStatus {
  if (!form) {
    return { state: "NONE", isOverdue: false, isComplete: false, daysUntilDue: null, needsAttention: false };
  }
  const state = form.state.toUpperCase();
  const isComplete = state === "COMPLETE";
  const isOverdue = state === "OVERDUE" || state === "EXPIRED" || state === "INVALID";
  const daysUntilDue = form.dueAt ? Math.ceil((form.dueAt.getTime() - now) / (24 * 60 * 60 * 1000)) : null;
  const needsAttention = !isComplete && (isOverdue || (daysUntilDue !== null && daysUntilDue <= 30));
  return { state, isOverdue, isComplete, daysUntilDue, needsAttention };
}
