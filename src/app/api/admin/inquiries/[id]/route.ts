import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth/session";

const VALID_STATUSES = ["NEW", "REVIEWED", "CONTACTED", "CLOSED"];

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const inquiry = await prisma.contactInquiry.findUnique({ where: { id } });
  if (!inquiry) return NextResponse.json({ error: "Inquiry not found" }, { status: 404 });
  return NextResponse.json({ inquiry });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const existing = await prisma.contactInquiry.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Inquiry not found" }, { status: 404 });

  const data: any = {};
  if ("status" in body) {
    if (!VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    data.status = body.status;
  }
  if ("internalNote" in body) {
    data.internalNote = typeof body.internalNote === "string" ? body.internalNote.trim() || null : null;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No changes provided" }, { status: 400 });
  }
  data.reviewedBy = session.email;

  const updated = await prisma.contactInquiry.update({ where: { id }, data });

  await prisma.auditLog.create({
    data: {
      action: "status" in body ? "INQUIRY_STATUS_UPDATED" : "INQUIRY_NOTE_UPDATED",
      actorEmail: session.email,
      metadata: { inquiryId: id, ...data, reviewedBy: undefined },
    },
  });

  return NextResponse.json({ inquiry: updated });
}
