import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { to, subject, message, type, internalReason, churchId } = body;

    if (!to || !subject || !message) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Process and "send" the email (mocked by DB entry for this task)
    const emailLog = await prisma.emailLog.create({
      data: {
        to,
        subject,
        type: type || "SUPPORT",
        status: "SENT",
        providerMessageId: "mock-message-id-" + Date.now(),
      },
    });

    // Also log to AuditLog
    await prisma.auditLog.create({
      data: {
        action: "ADMIN_SENT_SUPPORT_EMAIL",
        actorEmail: session.email,
        metadata: {
          to,
          subject,
          type,
          internalReason,
          churchId,
          emailLogId: emailLog.id,
        },
      },
    });

    return NextResponse.json({ success: true, emailLog });
  } catch (error) {
    console.error("Error sending email:", error);
    return NextResponse.json(
      { error: "Failed to send email" },
      { status: 500 }
    );
  }
}
