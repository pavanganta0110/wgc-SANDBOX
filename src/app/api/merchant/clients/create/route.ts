import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { normalizeEmail, normalizePhone, isValidEmail, isValidPhone } from "@/lib/donors/donorContact";
import { computeClientDisplayName } from "@/lib/clients/clientDisplayName";
import { findPossibleDuplicateClients } from "@/lib/clients/clientDuplicates";

function cleanString(value: unknown, maxLength = 200): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, maxLength) : null;
}

export async function POST(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  try {
    requirePermission(auth, "canManageClients");
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const body = await req.json();

  const clientType = body.clientType === "ORGANIZATION" ? "ORGANIZATION" : "INDIVIDUAL";
  const firstName = cleanString(body.firstName);
  const lastName = cleanString(body.lastName);
  const organizationName = cleanString(body.organizationName, 300);
  const email = cleanString(body.email, 320);
  const phone = cleanString(body.phone, 30);

  if (clientType === "INDIVIDUAL" && !firstName && !lastName) {
    return NextResponse.json({ error: "First or last name is required for an individual client." }, { status: 400 });
  }
  if (clientType === "ORGANIZATION" && !organizationName) {
    return NextResponse.json({ error: "Organization name is required for an organization client." }, { status: 400 });
  }
  if (email && !isValidEmail(email)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }
  if (phone && !isValidPhone(phone)) {
    return NextResponse.json({ error: "Please enter a valid U.S. phone number." }, { status: 400 });
  }

  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizePhone(phone);

  // Soft warning only — the caller may pass acknowledgeDuplicates: true to
  // proceed anyway once the merchant has reviewed the warning. Never a hard
  // block, per the approved spec.
  if (!body.acknowledgeDuplicates) {
    const duplicates = await findPossibleDuplicateClients(auth.churchId, { normalizedEmail, normalizedPhone, organizationName });
    if (duplicates.length > 0) {
      return NextResponse.json({ possibleDuplicates: duplicates }, { status: 409 });
    }
  }

  const linkedDonorId = cleanString(body.linkedDonorId);
  if (linkedDonorId) {
    const donor = await prisma.donor.findFirst({ where: { id: linkedDonorId, churchId: auth.churchId } });
    if (!donor) {
      return NextResponse.json({ error: "The selected donor could not be found in this organization." }, { status: 400 });
    }
  }

  const displayName = computeClientDisplayName({ clientType, firstName, lastName, organizationName });

  const client = await prisma.client.create({
    data: {
      churchId: auth.churchId,
      clientType,
      firstName,
      lastName,
      organizationName,
      displayName,
      email,
      normalizedEmail,
      phone,
      normalizedPhone,
      billingAddressLine1: cleanString(body.billingAddressLine1),
      billingAddressLine2: cleanString(body.billingAddressLine2),
      billingCity: cleanString(body.billingCity, 100),
      billingState: cleanString(body.billingState, 50),
      billingPostalCode: cleanString(body.billingPostalCode, 20),
      billingCountry: cleanString(body.billingCountry, 100),
      shippingAddressLine1: cleanString(body.shippingAddressLine1),
      shippingAddressLine2: cleanString(body.shippingAddressLine2),
      shippingCity: cleanString(body.shippingCity, 100),
      shippingState: cleanString(body.shippingState, 50),
      shippingPostalCode: cleanString(body.shippingPostalCode, 20),
      shippingCountry: cleanString(body.shippingCountry, 100),
      contactPersonName: cleanString(body.contactPersonName),
      taxOrReferenceId: cleanString(body.taxOrReferenceId, 100),
      notes: cleanString(body.notes, 5000),
      linkedDonorId,
      createdByUserId: auth.userId,
      createdByEmail: auth.email,
    },
  });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "client.created",
    entityType: "client",
    entityId: client.id,
    metadata: { displayName: client.displayName },
    req,
  });

  return NextResponse.json({ success: true, client });
}
