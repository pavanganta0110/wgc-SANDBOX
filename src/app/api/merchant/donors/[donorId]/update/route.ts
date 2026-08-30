import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { normalizeEmail, normalizePhone, isValidEmail, isValidPhone } from "@/lib/donors/donorContact";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { cleanAddressInput, hasAnyAddressField, isAddressSource, applyDonorAddressUpdate } from "@/lib/donors/donorAddress";

const ADDRESS_FIELD_NAMES = ["addressLine1", "addressLine2", "city", "state", "postalCode", "country"] as const;

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
  const permissions = getDonorPermissions(auth.impersonation ? "owner" : auth.rawRole);
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

  if ("companyName" in body) {
    const value = cleanString(body.companyName, 100);
    if (value !== donor.companyName) {
      data.companyName = value;
      changedFields.push("companyName");
    }
  }

  // Address fields are routed through applyDonorAddressUpdate below (its
  // own permission check, non-destructive-overwrite rule, and dedicated
  // audit event) rather than the generic loop above — never bundled into
  // the single "donor.updated" audit entry other profile fields share.
  const addressFieldsSent = ADDRESS_FIELD_NAMES.some((f) => f in body);
  let addressResult: Awaited<ReturnType<typeof applyDonorAddressUpdate>> | null = null;
  if (addressFieldsSent) {
    try {
      requirePermission(auth, "canEditDonorAddress");
    } catch {
      return NextResponse.json({ error: "You do not have permission to edit donor mailing addresses." }, { status: 403 });
    }
    const newAddress = cleanAddressInput(body);
    const source = isAddressSource(body.addressSource) ? body.addressSource : "MERCHANT_MANUAL_ENTRY";
    addressResult = await applyDonorAddressUpdate({
      donorId: donor.id,
      churchId: auth.churchId,
      newAddress,
      source,
      enteredByDonor: false,
      force: body.forceAddressUpdate === true,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.rawRole,
      req,
    });
    if (addressResult.status === "needs_confirmation") {
      return NextResponse.json(
        {
          error: "This donor already has a different mailing address on file. Confirm to replace it.",
          needsConfirmation: true,
          previousAddress: addressResult.previous,
        },
        { status: 409 }
      );
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
    // Address may still have been the only thing that changed — its own
    // audit event was already logged by applyDonorAddressUpdate above.
    const finalDonor = addressResult?.status === "updated" ? addressResult.donor : donor;
    return NextResponse.json({ donor: finalDonor, changedFields: addressResult?.status === "updated" ? ADDRESS_FIELD_NAMES.filter((f) => f in body) : [] });
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

  // Merge in the address fields applyDonorAddressUpdate already committed,
  // so the response reflects both in one consistent donor object.
  const finalDonor = addressResult?.status === "updated" ? { ...updated, ...addressResult.donor } : updated;

  return NextResponse.json({ donor: finalDonor, changedFields: [...changedFields, ...(addressResult?.status === "updated" ? ADDRESS_FIELD_NAMES.filter((f) => f in body) : [])] });
}
