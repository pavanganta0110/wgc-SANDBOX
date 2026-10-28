import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { sendDonorPortalInvites } from "@/lib/donorPortal/sendPortalInvites";

// A deliberate single resend is allowed sooner than a bulk re-invite, but not on every click.
const SINGLE_INVITE_THROTTLE_MS = 60 * 60 * 1000;

/** Emails one donor a link to the organization's donor portal. The donor is always looked up inside the session's church. */
export async function POST(req: Request, { params }: { params: Promise<{ donorId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const permissions = getDonorPermissions(auth.impersonation ? "owner" : auth.rawRole);
  if (!permissions.canView || !permissions.canSendStatements) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { donorId } = await params;
  const donor = await prisma.donor.findFirst({ where: { id: donorId, churchId: auth.churchId }, select: { id: true, name: true, email: true } });
  if (!donor) return NextResponse.json({ error: "Donor not found" }, { status: 404 });
  if (!donor.email) return NextResponse.json({ error: "This donor has no email address on file." }, { status: 400 });

  const result = await sendDonorPortalInvites({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    recipients: [{ donorId: donor.id, email: donor.email, name: donor.name }],
    throttleMs: SINGLE_INVITE_THROTTLE_MS,
  });

  if (result.skipped.optedOut > 0) return NextResponse.json({ error: "This donor has unsubscribed from your emails." }, { status: 400 });
  if (result.skipped.recentlyInvited > 0) return NextResponse.json({ error: "This donor was invited within the last hour." }, { status: 429 });
  if (result.sent !== 1) return NextResponse.json({ error: "The invite could not be sent. Please try again." }, { status: 502 });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "donor.portal_invite_sent",
    entityType: "donor",
    entityId: donor.id,
    metadata: {},
    req,
  });

  return NextResponse.json({ success: true });
}
