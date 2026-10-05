import { NextResponse } from "next/server";
import { uploadPublicCampaignImage } from "@/lib/storage/logoStorage";
import { guardEventsRoute } from "@/lib/eventRegistration/merchantGuard";
import { logDashboardAction } from "@/lib/dashboardAudit";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

/**
 * Uploads an event cover image and returns its public URL. Not tied to an
 * event id, so the New Event form can upload before the event exists — the
 * returned URL just goes into the event's own create/update payload. Stored
 * under the signed-in church's own folder.
 */
export async function POST(req: Request) {
  const guard = await guardEventsRoute("canManageEvents");
  if ("response" in guard) return guard.response;
  const { auth } = guard;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Invalid file type. Only PNG, JPG, JPEG, and WEBP are supported." }, { status: 400 });
    }
    if (file.size > MAX_IMAGE_SIZE) return NextResponse.json({ error: "File too large. Maximum size is 5MB." }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const storageKey = `${auth.churchId}/events/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const imageUrl = await uploadPublicCampaignImage(storageKey, buffer, file.type);

    await logDashboardAction({
      churchId: auth.churchId,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.rawRole,
      action: "event.image_uploaded",
      metadata: { fileName: file.name, fileSize: file.size, storageKey },
      req,
    });
    return NextResponse.json({ success: true, imageUrl });
  } catch (err) {
    console.error("Event image upload error:", err);
    return NextResponse.json({ error: "We couldn't upload that image. Please try again." }, { status: 500 });
  }
}
