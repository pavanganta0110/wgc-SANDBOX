import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";
import { uploadIrsLetter, getCurrentIrsLetter } from "@/lib/onboarding/irsLetterService";

/**
 * WGC-only 501(c)(3) IRS determination letter — organization-side upload,
 * completely independent of the Finix onboarding submission in
 * /api/onboarding. This route never imports @/lib/finix/client.
 *
 * Auth: no organization login exists until a Church is provisioned on
 * approval (see provisionChurchAccount), so the credential here is
 * knowledge of the onboardingApplicationId itself — the same trust level
 * already used by the existing /onboarding/success?applicationId= redirect
 * immediately after a successful submission. A wgc_admin session is also
 * accepted, for WGC uploading a replacement on the organization's behalf.
 */
export async function POST(req: Request, { params }: { params: Promise<{ applicationId: string }> }) {
  const { applicationId } = await params;

  const app = await prisma.onboardingApplication.findUnique({ where: { id: applicationId } });
  if (!app) {
    return NextResponse.json({ error: "This document is not available." }, { status: 404 });
  }

  const session = await getSession();
  const isAdmin = session?.role === "wgc_admin";

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) {
      return NextResponse.json({ error: "We could not upload the document. Please try again." }, { status: 400 });
    }

    const result = await uploadIrsLetter({
      onboardingApplicationId: applicationId,
      file,
      uploadedByUserId: isAdmin ? session!.userId : null,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    if (err.message === "NOT_FOUND") {
      return NextResponse.json({ error: "This document is not available." }, { status: 404 });
    }
    if (err.message && !err.message.startsWith("Storage") && err.message !== "INVALID_FILE") {
      // Known validation messages (from validateIrsLetterFile) are already safe to show.
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("IRS letter upload failed:", err);
    return NextResponse.json({ error: "We could not upload the document. Please try again." }, { status: 500 });
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ applicationId: string }> }) {
  const { applicationId } = await params;
  const app = await prisma.onboardingApplication.findUnique({ where: { id: applicationId } });
  if (!app) {
    return NextResponse.json({ error: "This document is not available." }, { status: 404 });
  }

  const document = await getCurrentIrsLetter(applicationId);
  if (!document) {
    return NextResponse.json({ document: null });
  }

  return NextResponse.json({
    document: {
      status: document.status,
      version: document.version,
      originalFilename: document.originalFilename,
      uploadedAt: document.uploadedAt,
      organizationFacingMessage: document.organizationFacingMessage,
    },
  });
}
