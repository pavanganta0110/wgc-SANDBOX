import { NextResponse } from "next/server";
import { uploadPublicCampaignImage } from "@/lib/storage/logoStorage";
import { auctionNotFound, guardAuctionsRoute, loadOwnedAuction } from "@/lib/auctions/merchantGuard";
import { logDashboardAction } from "@/lib/dashboardAudit";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

/** Uploads a photo for an item (or the auction's cover) and returns its public address. Stored under the signed-in organization's own folder. */
export async function POST(req: Request, { params }: { params: Promise<{ auctionId: string }> }) {
  const guard = await guardAuctionsRoute("canManageEvents");
  if ("response" in guard) return guard.response;
  const { auth } = guard;
  const { auctionId } = await params;
  const auction = await loadOwnedAuction(auth, auctionId);
  if (!auction) return auctionNotFound();

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) return NextResponse.json({ error: "Choose a photo." }, { status: 400 });
    if (!ALLOWED_TYPES.includes(file.type)) return NextResponse.json({ error: "Use a PNG, JPG or WEBP photo." }, { status: 400 });
    if (file.size > MAX_IMAGE_SIZE) return NextResponse.json({ error: "That photo is over 5MB. Try a smaller one." }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const storageKey = `${auth.churchId}/auctions/${auction.id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const imageUrl = await uploadPublicCampaignImage(storageKey, buffer, file.type);
    await logDashboardAction({ churchId: auth.churchId, actorUserId: auth.userId, actorEmail: auth.email, actorRole: auth.rawRole, action: "auction.image_uploaded", entityType: "auction", entityId: auction.id, metadata: { fileSize: file.size, storageKey }, req });
    return NextResponse.json({ success: true, imageUrl });
  } catch (err) {
    console.error("Auction image upload error:", err);
    return NextResponse.json({ error: "We couldn't upload that photo. Please try again." }, { status: 500 });
  }
}
