import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { setSessionCookie, type SessionPayload } from "@/lib/auth/session";
import type { User } from "@prisma/client";

/**
 * Everything that happens once a login is actually allowed to succeed —
 * pulled out of the plain-password login route so the new MFA code-verify
 * step (src/app/api/merchant/login/mfa-verify/route.ts) reaches the exact
 * same end state as a non-MFA login, rather than a second, drifting copy
 * of session-setting + account-linking logic.
 */
export async function completeMerchantLogin(user: User) {
  await setSessionCookie({
    userId: user.id,
    email: user.email,
    role: user.role as SessionPayload["role"],
    churchId: user.churchId,
    authVersion: user.authVersion,
  });

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  // Handle account linking if a pending link cookie is present
  const cookieStore = await cookies();
  const pendingLinkCookie = cookieStore.get("wgc_pending_link")?.value;
  if (pendingLinkCookie) {
    try {
      const pendingLink = JSON.parse(pendingLinkCookie);
      if (pendingLink.email === user.email) {
        await prisma.authAccount.upsert({
          where: { provider_providerAccountId: { provider: pendingLink.provider, providerAccountId: pendingLink.providerAccountId } },
          create: {
            userId: user.id,
            provider: pendingLink.provider,
            providerAccountId: pendingLink.providerAccountId,
            providerEmail: pendingLink.providerEmail,
            lastLoginAt: new Date(),
          },
          update: {
            userId: user.id,
            providerEmail: pendingLink.providerEmail,
            lastLoginAt: new Date(),
          },
        });

        if (user.churchId) {
          await prisma.dashboardAuditLog.create({
            data: {
              churchId: user.churchId,
              actorUserId: user.id,
              actorEmail: user.email,
              actorRole: user.role,
              action: `auth.${pendingLink.provider}_account_linked`,
              metadata: { provider: pendingLink.provider, providerEmail: pendingLink.providerEmail },
              createdAt: new Date(),
            },
          });
        } else {
          await prisma.auditLog.create({
            data: {
              action: `auth.${pendingLink.provider}_account_linked`,
              actorEmail: user.email,
              metadata: { provider: pendingLink.provider, providerEmail: pendingLink.providerEmail },
              createdAt: new Date(),
            },
          });
        }

        cookieStore.delete("wgc_pending_link");
      }
    } catch (err) {
      console.error("Account linking failed during login:", err);
    }
  }
}
