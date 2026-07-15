import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";

export async function GET(req: Request, { params }: { params: Promise<{ donorId: string }> }) {
  const session = await getSession();
  const permissions = getDonorPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canView) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { donorId } = await params;
  const donor = await prisma.donor.findFirst({ where: { id: donorId, churchId: session.churchId } });
  if (!donor) {
    return NextResponse.json({ error: "Donor not found" }, { status: 404 });
  }

  const notes = await prisma.donorNote.findMany({
    where: { donorId, churchId: session.churchId, deletedAt: null },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ notes });
}

export async function POST(req: Request, { params }: { params: Promise<{ donorId: string }> }) {
  const session = await getSession();
  const permissions = getDonorPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canAddNote) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { donorId } = await params;
  const donor = await prisma.donor.findFirst({ where: { id: donorId, churchId: session.churchId } });
  if (!donor) {
    return NextResponse.json({ error: "Donor not found" }, { status: 404 });
  }

  const body = await req.json();
  const noteBody = typeof body.body === "string" ? body.body.trim().slice(0, 4000) : "";
  if (!noteBody) {
    return NextResponse.json({ error: "Note body is required" }, { status: 400 });
  }

  const note = await prisma.donorNote.create({
    data: {
      donorId,
      churchId: session.churchId,
      body: noteBody,
      createdByUserId: session.userId,
      createdByEmail: session.email,
    },
  });

  await logDashboardAction({
    churchId: session.churchId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "donor.note_added",
    entityType: "donor",
    entityId: donorId,
    metadata: { noteId: note.id },
    req,
  });

  return NextResponse.json({ note });
}
