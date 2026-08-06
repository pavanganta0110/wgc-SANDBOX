import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { sendWgcEmail } from "@/lib/email";

/**
 * Runs when an OnboardingApplication is approved. Creates (or updates) the
 * Church row — which nothing else in the codebase populates today — and
 * provisions a church_admin User account with a set-password link, then
 * sends the "secure dashboard access email" referenced in the approval
 * email copy. Idempotent: safe to call again on webhook retries — but
 * "safe" means "won't re-invite someone who already finished setup," not
 * "won't retry a failed send." A User row existing is not proof the email
 * ever arrived, so re-invoking this only skips the email once the user has
 * actually set a password or logged in.
 */
export async function provisionChurchAccount(app: {
  id: string;
  organizationName: string;
  legalBusinessName: string | null;
  contactEmail: string;
  contactName: string;
  finixMerchantId: string | null;
  finixIdentityId: string | null;
  finixApplicationId: string | null;
}) {
  const orgName = app.legalBusinessName || app.organizationName;
  const slugBase = orgName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "church";

  let church = await prisma.church.findFirst({
    where: { onboardingApplicationId: app.id },
  });

  const applicationDb = await prisma.onboardingApplication.findUnique({
    where: { id: app.id },
    select: { promotion: true },
  });
  const promotion = applicationDb?.promotion || null;

  if (!church) {
    let slug = slugBase;
    let suffix = 1;
    while (await prisma.church.findUnique({ where: { slug } })) {
      slug = `${slugBase}-${suffix++}`;
    }

    church = await prisma.church.create({
      data: {
        name: orgName,
        slug,
        primaryContactEmail: app.contactEmail,
        onboardingApplicationId: app.id,
        finixMerchantId: app.finixMerchantId,
        finixIdentityId: app.finixIdentityId,
        finixApplicationId: app.finixApplicationId,
        status: "ACTIVE",
        promotion: promotion,
      },
    });
  } else {
    church = await prisma.church.update({
      where: { id: church.id },
      data: {
        finixMerchantId: app.finixMerchantId,
        finixIdentityId: app.finixIdentityId,
        finixApplicationId: app.finixApplicationId,
        status: "ACTIVE",
        promotion: promotion,
      },
    });
  }

  const existingUser = await prisma.user.findUnique({ where: { email: app.contactEmail } });

  // A User row existing does NOT mean the invite email ever actually
  // arrived — if sendWgcEmail failed or threw on a prior attempt (a
  // transient Resend error, for example), the User row is already
  // created by the time that happens, so every later webhook retry used
  // to hit this branch and return immediately without ever retrying the
  // email. That permanently strands a merchant with an account that
  // exists but no way to ever receive the link. Only skip re-sending
  // once the merchant has actually completed setup (set a password or
  // logged in) — never just because a row exists.
  if (existingUser && (existingUser.passwordHash || existingUser.lastLoginAt)) {
    if (existingUser.churchId !== church.id) {
      await prisma.user.update({ where: { id: existingUser.id }, data: { churchId: church.id } });
    }
    return { church, user: existingUser, emailSent: false };
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const user = existingUser
    ? await prisma.user.update({
        where: { id: existingUser.id },
        data: { churchId: church.id, setPasswordTokenHash: tokenHash, setPasswordTokenExpiresAt: expiresAt },
      })
    : await prisma.user.create({
        data: {
          email: app.contactEmail,
          role: "church_admin",
          churchId: church.id,
          setPasswordTokenHash: tokenHash,
          setPasswordTokenExpiresAt: expiresAt,
        },
      });

  const setPasswordLink = `https://www.wgcpayments.com/merchant/set-password/${rawToken}`;

  const result = await sendWgcEmail({
    to: app.contactEmail,
    subject: "Your WGC Payments dashboard access",
    title: "Set up your dashboard access",
    badgeText: "Action Required",
    badgeColor: "#0B5DBC",
    bodyHtml: `<p>Hi ${app.contactName || orgName},</p>
               <p>Your WGC Payments merchant dashboard is ready. Use the secure link below to set your password and log in.</p>
               <p><a href="${setPasswordLink}">Set your password</a></p>
               <p>This link expires in 7 days. If it expires, contact WGC Payments Support and we'll send a new one.</p>`,
  });

  // Logged unconditionally (success or failure) so this is visible in the
  // admin email-log UI and resendable via the existing DASHBOARD_ACCESS
  // resend action — previously this send was entirely untracked, so a
  // failure here left no trace anywhere but a server console log.
  await prisma.emailLog.create({
    data: {
      onboardingApplicationId: app.id,
      type: "DASHBOARD_ACCESS",
      to: app.contactEmail,
      subject: "Your WGC Payments dashboard access",
      status: result.success ? "SENT" : "ERROR",
      sentAt: result.success ? new Date() : null,
      error: result.success ? null : String(result.error ?? "unknown error"),
    },
  });

  return { church, user, emailSent: result.success };
}
