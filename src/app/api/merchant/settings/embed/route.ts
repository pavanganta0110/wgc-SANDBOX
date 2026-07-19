import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getSettingsPermissions } from "@/lib/settings/settingsPermissions";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { normalizeEmbedDomain } from "@/lib/giving/embedDomainCheck";
import { checkEmbedRateLimit } from "@/lib/giving/embedRateLimit";

export async function GET() {
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

  const church = await prisma.church.findUnique({
    where: { id: session.churchId },
    select: { embedDomainRestrictionEnabled: true, embedAllowedDomainsJson: true },
  });
  if (!church) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

  const givingLinks = await prisma.givingLink.findMany({
    where: { churchId: session.churchId, status: "ACTIVE" },
    select: { id: true, publicSlug: true, publicTitle: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    embedDomainRestrictionEnabled: church.embedDomainRestrictionEnabled,
    embedAllowedDomains: Array.isArray(church.embedAllowedDomainsJson) ? church.embedAllowedDomainsJson : [],
    givingLinks,
  });
}

export async function PATCH(req: Request) {
  const session = await getSession();
  const permissions = getSettingsPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canManageIntegrations) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
  if (!checkEmbedRateLimit(`embed-settings:${session.userId}:${ip}`)) {
    return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const enabled = Boolean(body.embedDomainRestrictionEnabled);
  const rawDomains = Array.isArray(body.embedAllowedDomains) ? body.embedAllowedDomains : [];

  const domains: string[] = Array.from(
    new Set<string>(
      rawDomains
        .filter((d: unknown): d is string => typeof d === "string")
        .map(normalizeEmbedDomain)
        .filter((d: string): d is string => Boolean(d))
    )
  );

  if (domains.length > 25) {
    return NextResponse.json({ error: "You can save at most 25 domains." }, { status: 400 });
  }

  await prisma.church.update({
    where: { id: session.churchId },
    data: { embedDomainRestrictionEnabled: enabled, embedAllowedDomainsJson: domains },
  });

  await logDashboardAction({
    churchId: session.churchId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "settings.embed_domains_updated",
    entityType: "church",
    entityId: session.churchId,
    metadata: { embedDomainRestrictionEnabled: enabled, domainCount: domains.length },
    req,
  });

  return NextResponse.json({ success: true, embedDomainRestrictionEnabled: enabled, embedAllowedDomains: domains });
}
