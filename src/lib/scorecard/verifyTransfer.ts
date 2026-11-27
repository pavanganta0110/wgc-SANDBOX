import { prisma } from "@/lib/prisma";
import { finixClient } from "@/lib/finix/client";
import { scorecardConfig } from "./config";

export type TransferCheck = { ok: true; transfer: { id: string; amount: number; created_at: string | null } } | { ok: false; reason: string };

/**
 * The Finix merchant the $100 is paid to: the organization that owns the scorecard's giving link. Read from our own
 * database, so it can never be left unset and skip the check.
 */
async function expectedMerchantId(): Promise<string | null> {
  const link = await prisma.givingLink.findUnique({ where: { publicSlug: scorecardConfig().givingLinkSlug }, select: { churchId: true } });
  if (!link) return null;
  const church = await prisma.church.findUnique({ where: { id: link.churchId }, select: { finixMerchantId: true } });
  return church?.finixMerchantId ?? null;
}

/**
 * Confirms a scorecard payment really happened before a report goes out: the transfer exists, SUCCEEDED, is a debit of
 * at least the report price, was paid to the scorecard's own merchant, and is recent (not an old payment someone found).
 * `notBefore` is the earliest the payment may have been made (a little before the buyer reached the success page).
 */
export async function verifyTransfer(transferId: string, notBefore: Date): Promise<TransferCheck> {
  if (!transferId || !/^TR[A-Za-z0-9]{10,40}$/.test(transferId)) return { ok: false, reason: "no_transfer_id" };
  const merchantId = await expectedMerchantId();
  if (!merchantId) return { ok: false, reason: "merchant_not_found" };

  let t: { id?: string; state?: string; type?: string; amount?: number; merchant?: string; created_at?: string };
  try {
    t = await finixClient.getTransfer(transferId);
  } catch (err) {
    const status = (err as { status?: number; statusCode?: number })?.status ?? (err as { statusCode?: number })?.statusCode;
    return { ok: false, reason: status === 404 ? "transfer_not_found" : "finix_unreachable" };
  }

  const price = scorecardConfig().priceCents;
  if (t.state !== "SUCCEEDED") return { ok: false, reason: `state_${t.state}` };
  if (t.type && t.type !== "DEBIT") return { ok: false, reason: `type_${t.type}` };
  if (Number(t.amount) < price) return { ok: false, reason: `amount_${t.amount}` };
  if (t.merchant !== merchantId) return { ok: false, reason: "wrong_merchant" };
  const created = t.created_at ? new Date(t.created_at) : null;
  if (!created || Number.isNaN(created.getTime()) || created < notBefore) return { ok: false, reason: "transfer_too_old" };
  return { ok: true, transfer: { id: String(t.id ?? transferId), amount: Number(t.amount), created_at: t.created_at ?? null } };
}
