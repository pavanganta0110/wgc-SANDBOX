import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { toSafeErrorResponse } from "@/lib/utils/errorNormalizer";
import { uploadPrivateFile, createSignedDownloadUrl } from "@/lib/storage/supabaseStorage";
import { loadScopedExternalDonation } from "@/lib/donations/externalDonationScope";

const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/heic", "image/webp", "application/pdf"]);

/** Returns a short-lived signed URL — gated by canViewExternalDonationProof,
 * never a public path, never surfaced on a donor receipt. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canViewExternalDonationProof");
  } catch (err) {
    if (isAuthError(err)) return toSafeErrorResponse(err.message, err.status);
    throw err;
  }

  const { id } = await params;
  const donation = await loadScopedExternalDonation(id, auth);
  if (!donation) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!donation.proofOfPaymentStorageKey) return NextResponse.json({ error: "No attachment on this donation" }, { status: 404 });

  const url = await createSignedDownloadUrl(donation.proofOfPaymentStorageKey, 300);
  return NextResponse.json({ url, fileName: donation.proofOfPaymentFileName });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canEditExternalDonation");
  } catch (err) {
    if (isAuthError(err)) return toSafeErrorResponse(err.message, err.status);
    throw err;
  }

  const { id } = await params;
  const donation = await loadScopedExternalDonation(id, auth);
  if (!donation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File must be under 10MB" }, { status: 400 });

  const storageKey = `external-donations/${auth.churchId}/${id}/${Date.now()}-${file.name}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await uploadPrivateFile(storageKey, buffer, file.type);

  const updated = await prisma.externalDonation.update({
    where: { id },
    data: { proofOfPaymentStorageKey: storageKey, proofOfPaymentFileName: file.name },
  });

  await prisma.externalDonationAuditLog.create({
    data: { externalDonationId: id, action: "PROOF_UPLOADED", performedByUserId: auth.userId },
  });

  return NextResponse.json({ donation: updated });
}
