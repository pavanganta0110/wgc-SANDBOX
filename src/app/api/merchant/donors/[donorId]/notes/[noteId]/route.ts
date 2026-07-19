import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";

async function loadOwnedNote(donorId: string, noteId: string, churchId: string) {
  return prisma.donorNote.findFirst({ where: { id: noteId, donorId, churchId, deletedAt: null } });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ donorId: string; noteId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const permissions = getDonorPermissions(auth.rawRole);
  if (!permissions.canAddNote) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { donorId, noteId } = await params;
  const note = await loadOwnedNote(donorId, noteId, auth.churchId);
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
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "donor.note_edited",
    entityType: "donor",
    entityId: donorId,
    metadata: { noteId: note.id },
    req,
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ donorId: string; noteId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const permissions = getDonorPermissions(auth.rawRole);
  if (!permissions.canAddNote) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { donorId, noteId } = await params;
  const note = await loadOwnedNote(donorId, noteId, auth.churchId);
  if (!note) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  await prisma.donorNote.update({ where: { id: note.id }, data: { deletedAt: new Date() } });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "donor.note_deleted",
    entityType: "donor",
    entityId: donorId,
    metadata: { noteId: note.id },
    req,
  });

  return NextResponse.json({ success: true });
}
