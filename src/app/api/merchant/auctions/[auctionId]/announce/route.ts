import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { validationError } from "@/lib/utils/validationError";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { auctionNotFound, guardAuctionsRoute, loadOwnedAuction } from "@/lib/auctions/merchantGuard";
import { ANNOUNCEMENT_MAX_RECIPIENTS, announcementWaitMs, audienceStatuses, parseEmailSettings, type AnnouncementAudience } from "@/lib/auctions/emailSettings";
import { sendAnnouncementEmail } from "@/lib/auctions/auctionEmails";
import { resolveInvoiceBranding } from "@/lib/invoices/invoiceBranding";

const AUDIENCES: AnnouncementAudience[] = ["ALL", "APPROVED", "WAITING"];

async function recipientsFor(auctionId: string, churchId: string, audience: AnnouncementAudience) {
  return prisma.auctionBidder.findMany({ where: { auctionId, churchId, status: { in: audienceStatuses(audience) } }, select: { id: true, name: true, email: true }, orderBy: { createdAt: "asc" }, take: ANNOUNCEMENT_MAX_RECIPIENTS + 1 });
}

/** How many people a message would reach, so the organization sees the number before it sends. */
export async function GET(req: Request, { params }: { params: Promise<{ auctionId: string }> }) {
  const guard = await guardAuctionsRoute("canViewEvents");
  if ("response" in guard) return guard.response;
  const { auth } = guard;
  const { auctionId } = await params;
  const auction = await loadOwnedAuction(auth, auctionId);
  if (!auction) return auctionNotFound();
  const audience = (new URL(req.url).searchParams.get("audience") ?? "ALL") as AnnouncementAudience;
  if (!AUDIENCES.includes(audience)) return validationError("Choose who to send to.");
  const count = await prisma.auctionBidder.count({ where: { auctionId, churchId: auth.churchId, status: { in: audienceStatuses(audience) } } });
  const waitMs = announcementWaitMs(parseEmailSettings(auction.emailSettingsJson), new Date());
  return NextResponse.json({ count, waitSeconds: waitMs ? Math.ceil(waitMs / 1000) : 0 });
}

/** Sends one message to everyone in the chosen group. At most once every 10 minutes, so a double click cannot email everyone twice. */
export async function POST(req: Request, { params }: { params: Promise<{ auctionId: string }> }) {
  const guard = await guardAuctionsRoute("canManageEvents");
  if ("response" in guard) return guard.response;
  const { auth } = guard;
  const { auctionId } = await params;
  const auction = await loadOwnedAuction(auth, auctionId);
  if (!auction) return auctionNotFound();
  if (auction.status === "DRAFT") return validationError("Publish the auction before messaging bidders.", 409);

  const body = await req.json().catch(() => ({}));
  const subject = typeof body.subject === "string" ? body.subject.trim().replace(/[\r\n]+/g, " ").slice(0, 150) : "";
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 5000) : "";
  if (!subject) return validationError("Write a subject.");
  if (!message) return validationError("Write your message.");
  if (!AUDIENCES.includes(body.audience)) return validationError("Choose who to send to.");

  const settings = parseEmailSettings(auction.emailSettingsJson);
  const waitMs = announcementWaitMs(settings, new Date());
  if (waitMs) return validationError(`A message was just sent. You can send another in ${Math.ceil(waitMs / 60_000)} minute(s).`, 429);

  const recipients = await recipientsFor(auction.id, auth.churchId, body.audience);
  if (recipients.length === 0) return validationError("Nobody is in that group yet.");
  if (recipients.length > ANNOUNCEMENT_MAX_RECIPIENTS) return validationError(`That group is larger than ${ANNOUNCEMENT_MAX_RECIPIENTS}. Choose a smaller group.`);

  // Claim the cooldown first, with one atomic update, so two sends at once cannot both go out.
  const nowIso = new Date().toISOString();
  const claimed = await prisma.auction.updateMany({
    where: { id: auction.id, churchId: auth.churchId, updatedAt: auction.updatedAt },
    data: { emailSettingsJson: { ...settings, lastAnnouncementAt: nowIso } as unknown as Prisma.InputJsonValue },
  });
  if (claimed.count === 0) return validationError("The auction changed while you were sending. Please try again.", 409);

  const branding = await resolveInvoiceBranding(auth.churchId);
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < recipients.length; i += 5) {
    const results = await Promise.all(
      recipients.slice(i, i + 5).map((r) =>
        sendAnnouncementEmail({ churchId: auth.churchId, auctionId: auction.id, auctionTitle: auction.title, slug: auction.slug, to: r.email, recipientName: r.name, subject, message, replyTo: branding.organizationSupportEmail ?? undefined })
      )
    );
    for (const ok of results) {
      if (ok) sent += 1;
      else failed += 1;
    }
  }

  await logDashboardAction({ churchId: auth.churchId, actorUserId: auth.userId, actorEmail: auth.email, actorRole: auth.rawRole, action: "auction.announcement_sent", entityType: "auction", entityId: auction.id, metadata: { audience: body.audience, sent, failed }, req });
  return NextResponse.json({ success: true, sent, failed });
}
