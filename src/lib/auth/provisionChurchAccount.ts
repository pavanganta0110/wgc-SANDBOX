import crypto from "crypto";
import { Prisma } from "@prisma/client";
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

    try {
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
    } catch (err) {
      // A concurrent provisioning attempt for the same application (e.g. a
      // webhook redelivery racing an admin's manual retry) won the race and
      // already created the Church row (Church.onboardingApplicationId is
      // @unique) — re-resolve instead of failing provisioning entirely.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const raced = await prisma.church.findFirst({ where: { onboardingApplicationId: app.id } });
        if (!raced) throw err;
        church = raced;
      } else {
        throw err;
      }
    }
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

  // Two different Finix events for the same merchant (e.g.
  // merchant.updated + merchant.underwritten) can both land within
  // milliseconds of each other and both reach this function concurrently —
  // confirmed in production (two DASHBOARD_ACCESS emails logged 21ms
  // apart for the same application). The plain "check existingUser, then
  // create/update, then send" sequence below has a real race window
  // between the check and the write, so both concurrent calls could pass
  // the check before either had written anything. pg_try_advisory_xact_lock
  // makes the check-and-claim atomic (same pattern as sendWebhookEmail in
  // the webhook route) without needing a schema migration — a losing
  // concurrent caller sees locked=false and skips sending entirely, since
  // the winner already owns this send. The lock is intentionally scoped to
  // just this instant of concurrency, not "ever" — a genuinely later,
  // separate webhook redelivery still resends the invite if the merchant
  // hasn't completed setup yet, which is deliberate (see the comment this
  // replaced): a User row existing is not proof the email ever arrived.
  const lockKey = `dashboard-access-invite:${church.id}`;
  const claim = await prisma.$transaction(async (tx) => {
    const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtext(${lockKey})) AS locked`;
    if (!locked) return null;

    const existingUser = await tx.user.findUnique({ where: { email: app.contactEmail } });

    if (existingUser && (existingUser.passwordHash || existingUser.lastLoginAt)) {
      if (existingUser.churchId !== church.id) {
        await tx.user.update({ where: { id: existingUser.id }, data: { churchId: church.id } });
      }
      return { alreadySetUp: true as const, user: existingUser };
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const user = existingUser
      ? await tx.user.update({
          where: { id: existingUser.id },
          data: { churchId: church.id, setPasswordTokenHash: tokenHash, setPasswordTokenExpiresAt: expiresAt },
        })
      : await tx.user.create({
          data: {
            email: app.contactEmail,
            role: "church_admin",
            churchId: church.id,
            setPasswordTokenHash: tokenHash,
            setPasswordTokenExpiresAt: expiresAt,
          },
        });

    return { alreadySetUp: false as const, user, rawToken };
  });

  if (!claim) {
    // Lost the race — a concurrent call for this same church already
    // claimed (or is actively handling) this send.
    return { church, user: null, emailSent: false };
  }
  if (claim.alreadySetUp) {
    return { church, user: claim.user, emailSent: false };
  }

  const { user, rawToken } = claim;

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
