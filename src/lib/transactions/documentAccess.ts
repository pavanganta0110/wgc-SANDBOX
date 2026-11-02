import { prisma } from "@/lib/prisma";
import type { MerchantAuthContext } from "@/lib/auth/requireMerchantSession";
import { resolveViewScope } from "@/lib/auth/viewScope";
import { buildFinixTransferScope } from "@/lib/auth/scopes";
import { hasPermission } from "@/lib/auth/permissions";

/**
 * The transfer, only if the signed-in user may see it — the same view-scope
 * rules as the payments list and receipts. Documents inherit exactly that
 * access: if you can't see the payment you can't see its documents.
 */
export async function loadScopedTransfer(auth: MerchantAuthContext, transferId: string) {
  const viewScope = await resolveViewScope(auth);
  const transferScope = await buildFinixTransferScope(auth, viewScope);
  return prisma.finixTransfer.findFirst({
    where: { AND: [{ finixTransferId: transferId }, transferScope] },
    select: { finixTransferId: true },
  });
}

/** Viewers are read-only everywhere; attaching and removing documents is a write. */
export function canAttachDocuments(auth: MerchantAuthContext): boolean {
  return auth.role !== "viewer";
}

/** Removing a document: whoever attached it, or anyone allowed to see all of the organization's transactions. */
export function canRemoveDocument(auth: MerchantAuthContext, document: { uploadedByUserId: string | null }): boolean {
  if (!canAttachDocuments(auth)) return false;
  return document.uploadedByUserId === auth.userId || hasPermission(auth, "canViewAllTransactions");
}
