import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { resolveCampaignAudience } from "@/lib/giving/campaignAudience";
import { sendDonorPortalInvites, MAX_INVITES_PER_REQUEST } from "@/lib/donorPortal/sendPortalInvites";

const BULK_INVITE_THROTTLE_MS = 7 * 24 * 60 * 60 * 1000;
// Only audiences that make sense for "invite people to see their giving".
const ALLOWED_SOURCES = ["ALL_DONORS", "IMPORTED_CONTACTS"] as const;
type InviteSource = (typeof ALLOWED_SOURCES)[number];

/**
 * Bulk portal invite. `dryRun: true` returns how many people would actually be
 * emailed (after skipping no-email, unsubscribed and recently-invited) without
 * sending anything. The audience is resolved server-side from the church's own
 * data — recipients are never accepted from the client.
 */
export async function POST(req: Request) {
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

  const body = await req.json().catch(() => ({}));
  const source = ALLOWED_SOURCES.find((s) => s === body.source) as InviteSource | undefined;
  if (!source) return NextResponse.json({ error: "Choose who to invite." }, { status: 400 });
  const dryRun = body.dryRun === true;

  const audience = await resolveCampaignAudience(auth.churchId, { source }, "EMAIL");
  if (!audience.ok) return NextResponse.json({ error: audience.error }, { status: audience.status });

  const result = await sendDonorPortalInvites({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    recipients: audience.recipients.map((r) => ({ donorId: r.donorId, email: r.email, name: r.name })),
    throttleMs: BULK_INVITE_THROTTLE_MS,
    dryRun,
  });

  if (!dryRun) {
    await logDashboardAction({
      churchId: auth.churchId,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.rawRole,
      action: "donor.portal_invites_sent",
      entityType: "donor",
      entityId: auth.churchId,
      metadata: { source, sent: result.sent, failed: result.failed, skipped: result.skipped, remaining: result.remaining },
      req,
    });
  }

  return NextResponse.json({ ...result, maxPerRequest: MAX_INVITES_PER_REQUEST, dryRun });
}
