import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/auth/session';

export async function GET(req: Request, { params }: { params: Promise<{ leadId: string }> }) {
  try {
    const { leadId } = await params;
    const session = await getAdminSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const lead = await prisma.firstLookLead.findUnique({
      where: { id: leadId },
      include: {
        notes: { orderBy: { createdAt: 'desc' } },
        activity: { orderBy: { createdAt: 'desc' } },
      }
    });

    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

    return NextResponse.json({ lead });
  } catch (error) {
    console.error('Failed to fetch lead:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ leadId: string }> }) {
  try {
    const { leadId } = await params;
    const session = await getAdminSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { status } = body;

    if (!status) return NextResponse.json({ error: 'Status is required' }, { status: 400 });

    const lead = await prisma.firstLookLead.update({
      where: { id: leadId },
      data: { status },
    });

    await prisma.firstLookLeadActivity.create({
      data: {
        leadId: lead.id,
        action: 'STATUS_CHANGED',
        metadataJson: { status },
        performedByAdminUserId: session.userId,
      }
    });

    return NextResponse.json({ lead });
  } catch (error) {
    console.error('Failed to update lead:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
