import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { normalizeEmail, normalizePhone, isValidEmail, isValidPhone } from "@/lib/donors/donorContact";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";

function cleanString(value: unknown, maxLength = 200): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, maxLength) : null;
}

// Only safe profile fields are editable here — never raw financial history,
// and never a processor-authoritative field (finixIdentityId is untouched).
export async function PATCH(req: Request, { params }: { params: Promise<{ donorId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const permissions = getDonorPermissions(auth.rawRole);
  if (!permissions.canEdit) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { donorId } = await params;
  const donor = await prisma.donor.findFirst({ where: { id: donorId, churchId: auth.churchId } });
  if (!donor) {
    return NextResponse.json({ error: "Donor not found" }, { status: 404 });
  }

  const body = await req.json();

  // Every field a caller didn't send is left completely alone (the key is
  // simply absent from `data` below) — a partial edit can never null out a
  // previously-populated value it wasn't trying to change.
  const data: Record<string, unknown> = {};
  const changedFields: string[] = [];

  if ("name" in body) {
    const name = cleanString(body.name, 200);
    if (!name) return NextResponse.json({ error: "Donor name cannot be empty" }, { status: 400 });
    if (name !== donor.name) {
      data.name = name;
      changedFields.push("name");
    }
  }

  if ("email" in body) {
    const email = cleanString(body.email, 320);
    if (email && !isValidEmail(email)) {
      return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });
    }
    if (email !== donor.email) {
      data.email = email;
      data.normalizedEmail = normalizeEmail(email);
      changedFields.push("email");
    }
  }

  if ("phone" in body) {
    const phone = cleanString(body.phone, 30);
    if (phone && !isValidPhone(phone)) {
      return NextResponse.json({ error: "Please enter a valid U.S. phone number" }, { status: 400 });
    }
    if (phone !== donor.phone) {
      data.phone = phone;
      data.normalizedPhone = normalizePhone(phone);
      changedFields.push("phone");
    }
  }

  for (const field of ["addressLine1", "addressLine2", "city", "state", "postalCode", "country", "companyName"] as const) {
    if (field in body) {
      const value = cleanString(body[field], field === "addressLine1" || field === "addressLine2" ? 200 : 100);
      if (value !== (donor as any)[field]) {
        data[field] = value;
        changedFields.push(field);
      }
    }
  }

  if ("anonymousPreference" in body) {
    const value = body.anonymousPreference === true;
    if (value !== donor.anonymousPreference) {
      data.anonymousPreference = value;
      changedFields.push("anonymousPreference");
    }
  }

  if (changedFields.length === 0) {
    return NextResponse.json({ donor, changedFields: [] });
  }

  const updated = await prisma.donor.update({ where: { id: donor.id }, data });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "donor.updated",
    entityType: "donor",
    entityId: donor.id,
    metadata: {
      changedFields,
      previousValues: Object.fromEntries(changedFields.map((f) => [f, (donor as any)[f]])),
    },
    req,
  });

  return NextResponse.json({ donor: updated, changedFields });
}
