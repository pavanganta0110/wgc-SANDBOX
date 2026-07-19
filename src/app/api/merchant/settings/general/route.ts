import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getSettingsPermissions } from "@/lib/settings/settingsPermissions";
import { isValidEmail, isValidPhone, normalizePhone } from "@/lib/donors/donorContact";
import { isValidHttpsUrl, normalizeWhitespace } from "@/lib/settings/settingsValidation";
import { logDashboardAction } from "@/lib/dashboardAudit";

const ORG_TYPES = ["NONPROFIT", "MINISTRY", "CHARITY", "FAITH_BASED", "COMMUNITY", "FOUNDATION", "RELIGIOUS", "OTHER"];

export async function GET(req: Request) {
  const session = await getSession();

  // Team-access Checkpoint 4A: explicit wgc_admin rejection — this route passes
  // session.role into a permission module that has its own wgc_admin branch
  // (for legitimate internal-support use via getSession() elsewhere); without
  // this guard, a wgc_admin session could be admitted here through that back
  // door. requireMerchantSession() (not yet adopted by this route) would
  // reject this unconditionally; this is the minimal-diff equivalent.
  if (session?.role === "wgc_admin") {
    return NextResponse.json({ error: "This route is not available to internal accounts." }, { status: 403 });
  }
  const permissions = getSettingsPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canView) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const church = await prisma.church.findUnique({ where: { id: session.churchId } });
  if (!church) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  return NextResponse.json({ settings: church });
}

export async function PATCH(req: Request) {
  const session = await getSession();
  const permissions = getSettingsPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canEdit) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const churchId = session.churchId;

  const body = await req.json();
  const current = await prisma.church.findUnique({ where: { id: churchId } });
  if (!current) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

  const errors: Record<string, string> = {};
  const data: Record<string, unknown> = {};

  const setStringField = (key: string, required = false) => {
    if (!(key in body)) return;
    const value = normalizeWhitespace(typeof body[key] === "string" ? body[key] : null);
    if (required && !value) {
      errors[key] = "This field is required";
      return;
    }
    data[key] = value;
  };

  if ("name" in body) {
    const name = normalizeWhitespace(body.name);
    if (!name) errors.name = "Legal name is required";
    else data.name = name;
  }
  setStringField("publicDisplayName");

  if ("organizationType" in body) {
    const orgType = typeof body.organizationType === "string" ? body.organizationType.toUpperCase() : null;
    if (orgType && !ORG_TYPES.includes(orgType)) errors.organizationType = "Invalid organization type";
    else data.organizationType = orgType;
  }

  if ("website" in body) {
    const website = normalizeWhitespace(body.website);
    if (website && !isValidHttpsUrl(website)) errors.website = "Please enter a valid https:// website URL";
    else data.website = website;
  }
  if ("phone" in body) {
    const phone = normalizeWhitespace(body.phone);
    if (phone && !isValidPhone(phone)) errors.phone = "Please enter a valid U.S. phone number";
    else data.phone = phone;
  }
  for (const emailField of ["primaryContactEmail", "supportEmail", "financeEmail", "technicalContactEmail"]) {
    if (!(emailField in body)) continue;
    const email = normalizeWhitespace(body[emailField]);
    if (emailField === "primaryContactEmail" && !email) {
      errors[emailField] = "Primary contact email is required";
      continue;
    }
    if (email && !isValidEmail(email)) {
      errors[emailField] = "Please enter a valid email address";
      continue;
    }
    data[emailField] = email;
  }

  setStringField("addressLine1");
  setStringField("addressLine2");
  setStringField("city");
  setStringField("state");
  setStringField("postalCode");
  setStringField("country");
  setStringField("mailingAddressLine1");
  setStringField("mailingAddressLine2");
  setStringField("mailingCity");
  setStringField("mailingState");
  setStringField("mailingPostalCode");
  setStringField("mailingCountry");
  setStringField("timezone");
  setStringField("dateFormat");
  setStringField("publicSupportContact");

  if ("fiscalYearStartMonth" in body) {
    const month = Number(body.fiscalYearStartMonth);
    if (body.fiscalYearStartMonth != null && (!Number.isInteger(month) || month < 1 || month > 12)) {
      errors.fiscalYearStartMonth = "Must be a month between 1 and 12";
    } else {
      data.fiscalYearStartMonth = body.fiscalYearStartMonth == null ? null : month;
    }
  }

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ error: "Validation failed", fieldErrors: errors }, { status: 400 });
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const previousValues: Record<string, unknown> = {};
  for (const key of Object.keys(data)) previousValues[key] = (current as any)[key];

  await prisma.church.update({ where: { id: churchId }, data });

  await logDashboardAction({
    churchId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "settings.general_updated",
    entityType: "church",
    entityId: churchId,
    metadata: { section: "General", changedFields: Object.keys(data), previousValues, newValues: data },
    req,
  });

  return NextResponse.json({ success: true });
}
