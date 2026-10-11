import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { toSafeErrorResponse } from "@/lib/utils/errorNormalizer";
import { generateWgcEmailHtml, sendWgcEmail } from "@/lib/email";
import { isEmailOptedOut } from "@/lib/giving/emailOptOut";
import { formatPersonName } from "@/lib/formatPersonName";
import { isValidEmail } from "@/lib/donors/donorContact";
import {
  FOLLOW_UP_BODY_MAX,
  FOLLOW_UP_SUBJECT_MAX,
  followUpFirstName,
  renderFollowUpBodyHtml,
  renderFollowUpSubject,
} from "@/lib/reporting/followUpTemplate";

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * One-off, merchant-written follow-up email to a single lapsed donor.
 *
 * `action: "preview"` renders exactly what would be sent (same branding,
 * merge fields and HTML as the real send) without sending; `action: "send"`
 * sends it and writes an OrgEmailLog row so it shows up in Email Logs. The
 * donor is always resolved from the session's church — a client-supplied
 * donorId is never trusted on its own.
 */
export async function POST(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return toSafeErrorResponse(err.message, err.status);
    throw err;
  }
  try {
    requirePermission(auth, "canViewDonors");
    requirePermission(auth, "canResendEmails");
  } catch (err) {
    if (err instanceof ForbiddenError) return toSafeErrorResponse(err.message, 403);
    throw err;
  }

  const body = await req.json().catch(() => ({}));
  const action = body.action === "send" ? "send" : "preview";
  const donorId = typeof body.donorId === "string" ? body.donorId : "";
  const subjectTemplate = typeof body.subject === "string" ? body.subject.trim() : "";
  const bodyTemplate = typeof body.body === "string" ? body.body.trim() : "";

  if (!donorId) return fail("Donor is required.", 400);
  if (!subjectTemplate) return fail("Subject is required.", 400);
  if (!bodyTemplate) return fail("Message is required.", 400);
  if (subjectTemplate.length > FOLLOW_UP_SUBJECT_MAX) return fail(`Subject must be ${FOLLOW_UP_SUBJECT_MAX} characters or fewer.`, 400);
  if (bodyTemplate.length > FOLLOW_UP_BODY_MAX) return fail(`Message must be ${FOLLOW_UP_BODY_MAX} characters or fewer.`, 400);

  const [donor, church] = await Promise.all([
    prisma.donor.findFirst({ where: { id: donorId, churchId: auth.churchId }, select: { id: true, name: true, email: true, archivedAt: true } }),
    prisma.church.findUnique({
      where: { id: auth.churchId },
      select: { name: true, logoUrl: true, primaryColor: true, statementSenderName: true, statementReplyToEmail: true, primaryContactEmail: true },
    }),
  ]);
  if (!donor || donor.archivedAt) return fail("Donor not found.", 404);
  if (!church) return fail("Organization not found.", 404);
  if (!donor.email || !isValidEmail(donor.email)) return fail("This donor has no valid email address on file.", 400);
  if (await isEmailOptedOut(auth.churchId, donor.email)) {
    return fail("This donor has unsubscribed from emails from your organization.", 409);
  }

  const donorName = formatPersonName(donor.name);
  const vars = { firstName: followUpFirstName(donorName), churchName: church.name };
  const subject = renderFollowUpSubject(subjectTemplate, vars);
  const bodyHtml = renderFollowUpBodyHtml(bodyTemplate, vars);
  const senderName = church.statementSenderName || church.name;
  const replyTo = church.statementReplyToEmail || church.primaryContactEmail;

  const emailOptions = {
    to: donor.email,
    subject,
    title: subject.replace(/</g, "&lt;").replace(/>/g, "&gt;"),
    badgeText: `A message from ${church.name}`,
    badgeColor: church.primaryColor || "#0B5DBC",
    bodyHtml,
    logoUrl: church.logoUrl || undefined,
    logoAlt: church.name,
    senderName,
    replyTo,
  };

  if (action === "preview") {
    return NextResponse.json({ to: donor.email, toName: donorName, subject, replyTo, html: generateWgcEmailHtml(emailOptions) });
  }

  const result = await sendWgcEmail({
    ...emailOptions,
    log: {
      churchId: auth.churchId,
      donorId: donor.id,
      recipientName: donorName === "—" ? null : donorName,
      category: "MERCHANT_NOTIFICATION",
      relatedEntityType: "Donor",
      relatedEntityId: donor.id,
      createdByUserId: auth.userId,
    },
  });
  if (!result.success) return fail("The email could not be sent. Please try again.", 502);
  return NextResponse.json({ success: true, to: donor.email });
}
