import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/auth/session';

export async function POST(req: Request, { params }: { params: Promise<{ leadId: string }> }) {
  try {
    const { leadId } = await params;
    const session = await getAdminSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { body: noteBody } = body;

    if (!noteBody || noteBody.trim() === '') {
      return NextResponse.json({ error: 'Note body is required' }, { status: 400 });
    }

    const note = await prisma.firstLookLeadNote.create({
      data: {
        leadId,
        adminUserId: session.userId,
        body: noteBody,
      }
    });

    await prisma.firstLookLeadActivity.create({
      data: {
        leadId,
        action: 'NOTE_ADDED',
        metadataJson: { noteId: note.id },
        performedByAdminUserId: session.userId,
      }
    });

    return NextResponse.json({ note });
  } catch (error) {
    console.error('Failed to add lead note:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
