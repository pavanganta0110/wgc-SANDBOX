import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { uploadPublicCampaignImage } from "@/lib/storage/logoStorage";
import { logDashboardAction } from "@/lib/dashboardAudit";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

/**
 * Uploads a cover image for a fundraising campaign/team/fundraiser and
 * returns its public URL — intentionally not tied to a specific campaign ID,
 * since this is also used from the New Campaign builder before any campaign
 * row exists yet (the returned imageUrl is just included in the campaign's
 * own create/update payload afterward, same as the org logo upload flow).
 */
export async function POST(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canCreateFundraisingCampaign");
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file || file.size === 0) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Invalid file type. Only PNG, JPG, JPEG, and WEBP are supported." }, { status: 400 });
    }
    if (file.size > MAX_IMAGE_SIZE) {
      return NextResponse.json({ error: "File too large. Maximum size is 5MB." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const storageKey = `${auth.churchId}/campaigns/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const imageUrl = await uploadPublicCampaignImage(storageKey, buffer, file.type);

    await logDashboardAction({
      churchId: auth.churchId,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.role,
      action: "fundraising_campaign.image_uploaded",
      // No entityType/entityId — this upload isn't tied to a saved campaign
      // yet when called from the New Campaign builder (see doc comment above).
      metadata: { fileName: file.name, fileSize: file.size, storageKey },
      req,
    });

    return NextResponse.json({ success: true, imageUrl });
  } catch (err: unknown) {
    console.error("Campaign image upload error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
