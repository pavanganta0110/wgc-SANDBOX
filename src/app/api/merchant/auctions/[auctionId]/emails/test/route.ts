import { NextResponse } from "next/server";
import { validationError } from "@/lib/utils/validationError";
import { auctionNotFound, guardAuctionsRoute, loadOwnedAuction } from "@/lib/auctions/merchantGuard";
import { EMAIL_KINDS, parseEmailSettings, type EmailKind } from "@/lib/auctions/emailSettings";
import { sendTestEmail } from "@/lib/auctions/auctionEmails";

/** Sends one automatic email, with sample details and the wording currently typed, to the person signed in. Never to a bidder. */
export async function POST(req: Request, { params }: { params: Promise<{ auctionId: string }> }) {
  const guard = await guardAuctionsRoute("canManageEvents");
  if ("response" in guard) return guard.response;
  const { auth } = guard;
  const { auctionId } = await params;
  const auction = await loadOwnedAuction(auth, auctionId);
  if (!auction) return auctionNotFound();

  const body = await req.json().catch(() => ({}));
  if (!EMAIL_KINDS.includes(body.kind)) return validationError("Choose which email to preview.");
  const sent = await sendTestEmail({
    churchId: auth.churchId, auctionId: auction.id, auctionTitle: auction.title, slug: auction.slug,
    to: auth.email, recipientName: "Sample Bidder", kind: body.kind as EmailKind,
    // The wording on screen, saved or not, so what is previewed is what was typed.
    settings: parseEmailSettings(body.settings ?? auction.emailSettingsJson),
  });
  if (!sent) return validationError("The preview could not be sent. Please try again.", 502);
  return NextResponse.json({ success: true, sentTo: auth.email });
}
