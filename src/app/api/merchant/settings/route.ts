import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { getSettingsPermissions } from "@/lib/settings/settingsPermissions";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  // Team-access Checkpoint 4D: was gated on the literal "church_admin" role
  // string only (no other role could ever pass) — migrated to the
  // centralized settings permission.
  if (!getSettingsPermissions(auth.rawRole).canEdit) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : undefined;
  const primaryContactEmail =
    typeof body.primaryContactEmail === "string" ? body.primaryContactEmail.trim() : undefined;

  if (!name && !primaryContactEmail) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  await prisma.church.update({
    where: { id: auth.churchId },
    data: {
      ...(name ? { name } : {}),
      ...(primaryContactEmail ? { primaryContactEmail } : {}),
    },
  });

  return NextResponse.json({ success: true });
}
