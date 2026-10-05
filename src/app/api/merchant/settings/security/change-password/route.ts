import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { bumpAuthVersion } from "@/lib/auth/session";

export async function POST(req: Request) {
  // Team-access Checkpoint 4C: migrated off getSession() to
  // requireMerchantSession() — password change is a security-sensitive
  // mutation, and requireMerchantSession() already fails closed for
  // wgc_admin and disabled users.
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  // A WGC admin viewing a merchant via impersonation has auth.userId set
  // to their OWN real user id (see requireMerchantSession.ts's
  // impersonation branch) — without this guard, this route would change
  // the ADMIN's own password and bumpAuthVersion() would sign the admin
  // out of their own real session, while the UI implies this is the
  // merchant's password.
  if (auth.impersonation) {
    return NextResponse.json({ error: "Personal account security settings aren't available while viewing as a merchant." }, { status: 403 });
  }

  // Reauthentication Gate
  const now = Math.floor(Date.now() / 1000);
  if (!auth.authTime || now - auth.authTime > 600) {
    return NextResponse.json({ error: "Reauthentication required. Please log in again to verify your identity.", reauthRequired: true }, { status: 403 });
  }

  const body = await req.json();
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

  if (newPassword.length < 8) {
    return NextResponse.json({ error: "New password must be at least 8 characters." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: auth.userId } });
  if (!user || !user.passwordHash) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const currentValid = await verifyPassword(currentPassword, user.passwordHash);
  if (!currentValid) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  // A password change must kill every other session (a stolen cookie
  // otherwise survives its own victim's password change) — this is the
  // one place in the codebase besides admin-forced actions that does so.
  // Invalidates the CALLER's own session too, by design; the frontend
  // should treat a successful response here as "log in again."
  await bumpAuthVersion(user.id);

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "settings.password_changed",
    entityType: "user",
    entityId: user.id,
    req,
  });

  return NextResponse.json({ success: true });
}
