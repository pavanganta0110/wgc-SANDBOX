import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { uploadPrivateFile } from "@/lib/storage/supabaseStorage";
import { canAttachDocuments, canRemoveDocument, loadScopedTransfer } from "@/lib/transactions/documentAccess";
import { MAX_DOCUMENTS_PER_TRANSACTION, buildDocumentStorageKey, validateDocumentUpload } from "@/lib/transactions/documents";

/** The supporting documents on a transaction (metadata only; files are fetched through the signed download route). */
export async function GET(_req: Request, { params }: { params: Promise<{ transferId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { transferId } = await params;
  if (!(await loadScopedTransfer(auth, transferId))) return NextResponse.json({ error: "Payment not found" }, { status: 404 });

  const documents = await prisma.transactionDocument.findMany({
    where: { churchId: auth.churchId, finixTransferId: transferId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, fileName: true, mimeType: true, sizeBytes: true, uploadedByUserId: true, uploadedByEmail: true, createdAt: true },
  });
  return NextResponse.json({
    canAttach: canAttachDocuments(auth),
    documents: documents.map((d) => ({ ...d, canRemove: canRemoveDocument(auth, d) })),
  });
}

/** Attach a document (multipart field "file"). */
export async function POST(req: Request, { params }: { params: Promise<{ transferId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  if (!canAttachDocuments(auth)) return NextResponse.json({ error: "You don't have permission to attach documents." }, { status: 403 });

  const { transferId } = await params;
  if (!(await loadScopedTransfer(auth, transferId))) return NextResponse.json({ error: "Payment not found" }, { status: 404 });

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file provided." }, { status: 400 });

  const existing = await prisma.transactionDocument.count({
    where: { churchId: auth.churchId, finixTransferId: transferId, deletedAt: null },
  });
  if (existing >= MAX_DOCUMENTS_PER_TRANSACTION) {
    return NextResponse.json({ error: `A payment can have up to ${MAX_DOCUMENTS_PER_TRANSACTION} documents.` }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const validation = validateDocumentUpload({ name: file.name, size: bytes.length, type: file.type });
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

  const storageKey = buildDocumentStorageKey(auth.churchId, transferId, validation.safeName);
  try {
    await uploadPrivateFile(storageKey, bytes, validation.mimeType);
  } catch (err) {
    console.error("Transaction document upload failed:", err);
    return NextResponse.json({ error: "The file couldn't be saved. Please try again." }, { status: 502 });
  }

  const document = await prisma.transactionDocument.create({
    data: {
      churchId: auth.churchId,
      finixTransferId: transferId,
      fileName: file.name.slice(0, 200),
      mimeType: validation.mimeType,
      sizeBytes: bytes.length,
      storageKey,
      uploadedByUserId: auth.impersonation ? null : auth.userId,
      uploadedByEmail: auth.impersonation ? `${auth.impersonation.adminEmail ?? "WGC admin"} (support)` : auth.email,
    },
    select: { id: true, fileName: true },
  });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "transaction.document_uploaded",
    entityType: "transfer",
    entityId: transferId,
    metadata: { documentId: document.id, fileName: document.fileName, sizeBytes: bytes.length },
    req,
  });

  return NextResponse.json({ success: true, document }, { status: 201 });
}
