import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";

async function loadOwnedNote(donorId: string, noteId: string, churchId: string) {
  return prisma.donorNote.findFirst({ where: { id: noteId, donorId, churchId, deletedAt: null } });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ donorId: string; noteId: string }> }) {
  const session = await getSession();
  const permissions = getDonorPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canAddNote) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { donorId, noteId } = await params;
  const note = await loadOwnedNote(donorId, noteId, session.churchId);
  if (!note) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  const body = await req.json();
  const noteBody = typeof body.body === "string" ? body.body.trim().slice(0, 4000) : "";
  if (!noteBody) {
    return NextResponse.json({ error: "Note body is required" }, { status: 400 });
  }

  await prisma.donorNote.update({ where: { id: note.id }, data: { body: noteBody } });

  await logDashboardAction({
    churchId: session.churchId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "donor.note_edited",
    entityType: "donor",
    entityId: donorId,
    metadata: { noteId: note.id },
    req,
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ donorId: string; noteId: string }> }) {
  const session = await getSession();
  const permissions = getDonorPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canAddNote) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { donorId, noteId } = await params;
  const note = await loadOwnedNote(donorId, noteId, session.churchId);
  if (!note) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  await prisma.donorNote.update({ where: { id: note.id }, data: { deletedAt: new Date() } });

  await logDashboardAction({
    churchId: session.churchId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "donor.note_deleted",
    entityType: "donor",
    entityId: donorId,
    metadata: { noteId: note.id },
    req,
  });

  return NextResponse.json({ success: true });
}
