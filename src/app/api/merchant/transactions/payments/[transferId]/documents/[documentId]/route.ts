import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { TransactionDocument } from "@prisma/client";
import { requireMerchantSession, type MerchantAuthContext } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { createSignedDownloadUrl } from "@/lib/storage/supabaseStorage";
import { canRemoveDocument, loadScopedTransfer } from "@/lib/transactions/documentAccess";

type Authorized =
  | { ok: true; auth: MerchantAuthContext; document: TransactionDocument }
  | { ok: false; response: Response };

async function authorize(transferId: string, documentId: string): Promise<Authorized> {
  let auth: MerchantAuthContext;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return { ok: false, response: NextResponse.json({ error: err.message }, { status: err.status }) };
    throw err;
  }
  if (!(await loadScopedTransfer(auth, transferId))) {
    return { ok: false, response: NextResponse.json({ error: "Payment not found" }, { status: 404 }) };
  }
  const document = await prisma.transactionDocument.findFirst({
    where: { id: documentId, churchId: auth.churchId, finixTransferId: transferId, deletedAt: null },
  });
  if (!document) return { ok: false, response: NextResponse.json({ error: "Document not found" }, { status: 404 }) };
  return { ok: true, auth, document };
}

/** Download: redirects to a short-lived signed URL that forces a download. Never a public or permanent link. */
export async function GET(req: Request, { params }: { params: Promise<{ transferId: string; documentId: string }> }): Promise<Response> {
  const { transferId, documentId } = await params;
  const result = await authorize(transferId, documentId);
  if (!result.ok) return result.response;
  const { auth, document } = result;

  let url: string;
  try {
    url = await createSignedDownloadUrl(document.storageKey, 300, { download: document.fileName });
  } catch (err) {
    console.error("Transaction document signed URL failed:", err);
    return NextResponse.json({ error: "The file couldn't be retrieved. Please try again." }, { status: 502 });
  }

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "transaction.document_downloaded",
    entityType: "transfer",
    entityId: transferId,
    metadata: { documentId, fileName: document.fileName },
    req,
  });
  return NextResponse.redirect(url, 302);
}

/** Remove a document from the transaction. Soft delete: the row stays for the audit trail, the file is no longer served. */
export async function DELETE(req: Request, { params }: { params: Promise<{ transferId: string; documentId: string }> }): Promise<Response> {
  const { transferId, documentId } = await params;
  const result = await authorize(transferId, documentId);
  if (!result.ok) return result.response;
  const { auth, document } = result;
  if (!canRemoveDocument(auth, document)) {
    return NextResponse.json({ error: "You don't have permission to remove this document." }, { status: 403 });
  }

  await prisma.transactionDocument.update({
    where: { id: documentId },
    data: { deletedAt: new Date(), deletedByUserId: auth.userId },
  });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "transaction.document_removed",
    entityType: "transfer",
    entityId: transferId,
    metadata: { documentId, fileName: document.fileName },
    req,
  });
  return NextResponse.json({ success: true });
}
