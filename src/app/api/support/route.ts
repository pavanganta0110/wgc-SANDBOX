import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWgcEmail } from "@/lib/email";
import { checkSupportRateLimit } from "@/lib/supportRateLimit";

const SUPPORT_CATEGORIES = [
  "Subscription and billing",
  "Account access",
  "Payment issue",
  "Settlement or deposit",
  "Refund",
  "Technical issue",
  "Cancellation request",
  "Other",
];

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Public merchant support form (/support) — shares the ContactInquiry
 * table and admin triage workflow with /api/contact (the sales inquiry
 * form) rather than a new table, since both are "someone submitted a
 * message WGC staff need to see and respond to." `role` holds the support
 * category here (same free-text field /api/contact uses for partnership
 * role) and the optional merchant ID is folded into the message body —
 * deliberately no schema change for this feature.
 */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  if (!checkSupportRateLimit(ip)) {
    return NextResponse.json({ error: "Too many submissions. Please wait a minute and try again." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const organizationName = typeof body.organizationName === "string" ? body.organizationName.trim() : "";
  const merchantId = typeof body.merchantId === "string" ? body.merchantId.trim() : "";
  const category = typeof body.category === "string" ? body.category.trim() : "";
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!fullName || !isValidEmail(email) || !subject || !message) {
    return NextResponse.json({ error: "Full name, a valid email, subject, and message are required." }, { status: 400 });
  }
  if (!SUPPORT_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: "Please select a valid support category." }, { status: 400 });
  }

  const [firstName, ...rest] = fullName.split(/\s+/);
  const lastName = rest.join(" ") || "-";

  const fullMessage = merchantId ? `Merchant ID: ${merchantId}\n\n${message}` : message;

  // Persisted before the email attempt — recoverable from the database
  // even if the email provider is down/misconfigured.
  const inquiry = await prisma.contactInquiry.create({
    data: {
      firstName,
      lastName,
      email,
      company: organizationName || null,
      role: category,
      subject,
      message: fullMessage,
    },
  });

  const notifyTo = process.env.SUPPORT_EMAIL || "support@wgcpayments.com";
  const result = await sendWgcEmail({
    to: notifyTo,
    subject: `New Support Request: ${subject}`,
    title: "New Support Request",
    badgeText: category.toUpperCase(),
    badgeColor: "#B45309",
    bodyHtml: `
      <p><strong>Name:</strong> ${fullName}</p>
      <p><strong>Email:</strong> ${email}</p>
      ${organizationName ? `<p><strong>Organization:</strong> ${organizationName}</p>` : ""}
      ${merchantId ? `<p><strong>Merchant ID:</strong> ${merchantId}</p>` : ""}
      <p><strong>Category:</strong> ${category}</p>
      <p><strong>Subject:</strong> ${subject}</p>
      <div style="margin-top: 20px; padding: 15px; background-color: #F0F4F8; border-radius: 8px;">
        <p style="margin: 0; white-space: pre-wrap;">${message}</p>
      </div>
    `,
  });

  await prisma.contactInquiry.update({
    where: { id: inquiry.id },
    data: {
      emailSent: result.success,
      emailError: result.success ? null : JSON.stringify(result.error),
    },
  });

  return NextResponse.json({ status: "ok" });
}
