import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { uploadPublicLogo } from "@/lib/storage/logoStorage";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const MAX_LOGO_SIZE = 5 * 1024 * 1024;

/** A dedicated invoice logo, separate from the primary merchant logo (per
 * "Use a separate invoice logo if desired" / "Revert to the primary
 * merchant logo"). Storage key is always namespaced under the caller's own
 * churchId — a merchant can never overwrite or read another merchant's
 * logo object, since every key it could ever reference is derived from its
 * own auth.churchId, never a client-supplied path. */
export async function POST(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  try {
    requirePermission(auth, "canManageInvoiceSettings");
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Invalid file type. Only PNG, JPG, JPEG, and WEBP are supported." }, { status: 400 });
  }
  if (file.size > MAX_LOGO_SIZE) {
    return NextResponse.json({ error: "File too large. Maximum size is 5MB." }, { status: 400 });
  }

  let logoUrl: string;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const storageKey = `${auth.churchId}/invoice-logo/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    logoUrl = await uploadPublicLogo(storageKey, buffer, file.type);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not upload logo." }, { status: 502 });
  }

  const settings = await prisma.invoiceSettings.upsert({
    where: { churchId: auth.churchId },
    create: { churchId: auth.churchId, invoiceLogoUrl: logoUrl },
    update: { invoiceLogoUrl: logoUrl },
  });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "invoice_settings.logo_uploaded",
    entityType: "invoice_settings",
    metadata: { fileName: file.name, fileSize: file.size },
    req,
  });

  return NextResponse.json({ success: true, logoUrl: settings.invoiceLogoUrl });
}
