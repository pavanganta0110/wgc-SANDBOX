import { NextResponse } from "next/server";
import { createPublicUploadTarget } from "@/lib/storage/logoStorage";
import { guardEventsRoute } from "@/lib/eventRegistration/merchantGuard";
import { logDashboardAction } from "@/lib/dashboardAudit";

const ALLOWED: Record<string, string> = { "video/mp4": "mp4", "video/webm": "webm" };
export const MAX_VIDEO_BYTES = 150 * 1024 * 1024;

/**
 * POST { fileName, contentType, size } -> { uploadUrl, publicUrl }.
 * Hands the browser a one-time storage upload target for a thank-you video
 * (the file itself never passes through this server — it's far larger than a
 * serverless request body can be). Type and size are checked here before any
 * target is issued, and the object always lives under the signed-in church's
 * own folder. Only mp4 and webm: those are what the thank-you screen can play.
 */
export async function POST(req: Request) {
  const guard = await guardEventsRoute("canManageEvents");
  if ("response" in guard) return guard.response;
  const { auth } = guard;

  const body = await req.json().catch(() => null);
  const contentType = typeof body?.contentType === "string" ? body.contentType.toLowerCase() : "";
  const size = Number(body?.size);
  const extension = ALLOWED[contentType];
  if (!extension) return NextResponse.json({ error: "Upload an MP4 or WebM video, or paste a YouTube/Vimeo link instead." }, { status: 400 });
  if (!Number.isFinite(size) || size <= 0) return NextResponse.json({ error: "No file provided." }, { status: 400 });
  if (size > MAX_VIDEO_BYTES) return NextResponse.json({ error: "That video is over 150 MB. Upload a shorter one, or paste a YouTube/Vimeo link instead." }, { status: 400 });

  const baseName = String(body?.fileName ?? "video").replace(/\.[^.]*$/, "").replace(/[^a-zA-Z0-9-]/g, "_").slice(0, 60) || "video";
  const storageKey = `${auth.churchId}/events/media/${Date.now()}_${baseName}.${extension}`;

  try {
    const target = await createPublicUploadTarget(storageKey);
    await logDashboardAction({
      churchId: auth.churchId,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.rawRole,
      action: "event.video_upload_started",
      metadata: { storageKey, size },
      req,
    });
    return NextResponse.json(target);
  } catch (err) {
    console.error("Event video upload target error:", err);
    return NextResponse.json({ error: "We couldn't prepare that upload. Please try again, or paste a video link instead." }, { status: 500 });
  }
}
