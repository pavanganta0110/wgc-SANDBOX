import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getSettingsPermissions } from "@/lib/settings/settingsPermissions";
import { isValidEmail } from "@/lib/donors/donorContact";
import { renderReceiptPreviewHtml } from "@/lib/settings/renderReceiptPreview";
import { sendWgcEmail } from "@/lib/email";
import { logDashboardAction } from "@/lib/dashboardAudit";

/** Sends only to an entered, confirmed email — never a stored donor address — per the explicit requirement that a test receipt must go only to an authorized entered email after confirmation. */
export async function POST(req: Request) {
  const session = await getSession();
  const permissions = getSettingsPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canEdit) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const to = typeof body.email === "string" ? body.email.trim() : "";
  if (!isValidEmail(to)) return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });

  const church = await prisma.church.findUnique({ where: { id: session.churchId } });
  if (!church) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

  const { subject, bodyHtml } = renderReceiptPreviewHtml(church);
  const result = await sendWgcEmail({
    to,
    subject: `[TEST] ${subject}`,
    title: "Thank You for Your Gift",
    badgeText: "Receipt Preview",
    badgeColor: "#10B981",
    bodyHtml: `<p style="color:#C99A2E;font-weight:600;">This is a test receipt using sample donation data.</p>` + bodyHtml,
  });

  await logDashboardAction({
    churchId: session.churchId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "settings.receipt_test_sent",
    entityType: "church",
    entityId: session.churchId,
    metadata: { to },
    req,
  });

  if (!result.success) return NextResponse.json({ error: "Failed to send test receipt" }, { status: 502 });
  return NextResponse.json({ success: true });
}
