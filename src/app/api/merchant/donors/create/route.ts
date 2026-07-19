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

// Manual donor creation is safe under the current architecture: Donor.finixIdentityId
// is already nullable everywhere it's read, so a donor created here has no
// processor identity until an actual payment flow creates one — nothing
// downstream assumes every Donor row has a Finix identity attached.
export async function POST(req: Request) {
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

  const body = await req.json();

  const name = cleanString(body.name, 200);
  const email = cleanString(body.email, 320);
  const phone = cleanString(body.phone, 30);

  if (!name) {
    return NextResponse.json({ error: "Donor name is required" }, { status: 400 });
  }
  if (email && !isValidEmail(email)) {
    return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });
  }
  if (phone && !isValidPhone(phone)) {
    return NextResponse.json({ error: "Please enter a valid U.S. phone number" }, { status: 400 });
  }

  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizePhone(phone);

  if (normalizedEmail) {
    const existing = await prisma.donor.findFirst({
      where: { churchId: auth.churchId, normalizedEmail, archivedAt: null },
    });
    if (existing) {
      return NextResponse.json(
        { error: "A donor with this email already exists in your organization.", existingDonorId: existing.id },
        { status: 409 },
      );
    }
  }

  const donor = await prisma.donor.create({
    data: {
      churchId: auth.churchId,
      name,
      email,
      normalizedEmail,
      phone,
      normalizedPhone,
      addressLine1: cleanString(body.addressLine1),
      addressLine2: cleanString(body.addressLine2),
      city: cleanString(body.city, 100),
      state: cleanString(body.state, 100),
      postalCode: cleanString(body.postalCode, 20),
      country: cleanString(body.country, 100),
      companyName: cleanString(body.companyName, 200),
      anonymousPreference: body.anonymousPreference === true,
    },
  });

  if (typeof body.internalNote === "string" && body.internalNote.trim()) {
    await prisma.donorNote.create({
      data: {
        donorId: donor.id,
        churchId: auth.churchId,
        body: body.internalNote.trim().slice(0, 4000),
        createdByUserId: auth.userId,
        createdByEmail: auth.email,
      },
    });
  }

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "donor.created",
    entityType: "donor",
    entityId: donor.id,
    req,
  });

  return NextResponse.json({ donor });
}
