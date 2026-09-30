import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getSettingsPermissions } from "@/lib/settings/settingsPermissions";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { uploadPublicLogo } from "@/lib/storage/logoStorage";
import { revalidatePath } from "next/cache";

// SVG deliberately excluded — matches every sibling logo/image upload route
// in this codebase (invoicing logo-upload, giving-links logo-upload,
// campaigns image-upload), none of which accept it. Confirmed via security
// review: an uploaded SVG lands in the PUBLIC merchant-logos storage
// bucket with its content-type preserved, and an SVG can embed a <script>
// — this app's own <img src> rendering never executes it, but a direct
// visit to the public storage URL might, depending on how that origin
// serves the file. This route was the one inconsistent exception; removing
// SVG here just brings it in line with the rest of the app rather than
// fixing something uniquely broken about this route.
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const MAX_LOGO_SIZE = 5 * 1024 * 1024;

export async function POST(req: Request) {
  const session = await getSession();
  const permissions = getSettingsPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canManageBranding) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file || file.size === 0) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Only PNG, JPG, JPEG, SVG, and WEBP are supported." },
        { status: 400 }
      );
    }
    if (file.size > MAX_LOGO_SIZE) {
      return NextResponse.json({ error: "File too large. Maximum size is 5MB." }, { status: 400 });
    }

    const church = await prisma.church.findUnique({
      where: { id: session.churchId },
      select: { finixMerchantId: true, finixIdentityId: true },
    });
    const linkedTo = church?.finixMerchantId || church?.finixIdentityId;
    if (!linkedTo) {
      return NextResponse.json({ error: "Your organization is not initialized with a Finix account." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const storageKey = `${session.churchId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const logoUrl = await uploadPublicLogo(storageKey, buffer, file.type);

    await prisma.church.update({ where: { id: session.churchId }, data: { logoUrl } });

    // Invalidate giving pages that rely on this logo
    const givingLinks = await prisma.givingLink.findMany({ where: { churchId: session.churchId }, select: { publicSlug: true } });
    for (const link of givingLinks) {
      revalidatePath(`/g/${link.publicSlug}`);
      revalidatePath(`/embed/${link.publicSlug}`);
    }

    await logDashboardAction({
      churchId: session.churchId,
      actorUserId: session.userId,
      actorEmail: session.email,
      actorRole: session.role,
      action: "settings.branding_logo_uploaded",
      entityType: "church",
      entityId: session.churchId,
      metadata: { fileName: file.name, fileSize: file.size, storageKey },
      req,
    });

    return NextResponse.json({ success: true, logoUrl });
  } catch (err: any) {
    console.error("Org logo upload error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
