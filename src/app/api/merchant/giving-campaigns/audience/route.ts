import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { hasPermission } from "@/lib/auth/permissions";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { isAudienceSource, resolveCampaignAudience } from "@/lib/giving/campaignAudience";

/**
 * Counts (and samples) who a campaign audience would reach, without creating
 * anything — powers the live "N people will receive this" line in the
 * composer. Same permission tier as creating the campaign; the audience
 * resolver itself re-checks every id against the session's church.
 */
export async function POST(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const permissions = getDonorPermissions(auth.rawRole);
  if (!permissions.canView || !permissions.canSendStatements) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const audience = body.audience && typeof body.audience === "object" ? body.audience : {};
  if (!isAudienceSource(audience.source)) return NextResponse.json({ error: "Choose who to send to." }, { status: 400 });
  if ((audience.source === "EVENT" || audience.source === "NOT_REGISTERED") && !hasPermission(auth, "canViewEvents")) {
    return NextResponse.json({ error: "You don't have permission to message event attendees." }, { status: 403 });
  }

  const result = await resolveCampaignAudience(
    auth.churchId,
    {
      source: audience.source,
      givingLinkId: typeof audience.givingLinkId === "string" ? audience.givingLinkId : undefined,
      eventId: typeof audience.eventId === "string" ? audience.eventId : undefined,
      eventScope: typeof audience.eventScope === "string" ? audience.eventScope : undefined,
      base: audience.base === "DONORS" ? "DONORS" : "EVERYONE",
    },
    body.channel === "TEXT" ? "TEXT" : "EMAIL"
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({
    count: result.recipients.length,
    sample: result.recipients.slice(0, 5).map((r) => r.name || r.email || r.phone || "Unnamed"),
  });
}
