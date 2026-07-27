import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/auth/session';

export async function GET(req: Request) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q') || '';
    const status = searchParams.get('status') || 'ALL';
    const sort = searchParams.get('sort') || 'newest';

    const where: any = {};
    if (status !== 'ALL') {
      where.status = status;
    }
    if (q) {
      where.OR = [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { normalizedEmail: { contains: q, mode: 'insensitive' } },
        { organizationName: { contains: q, mode: 'insensitive' } },
      ];
    }

    const leads = await prisma.firstLookLead.findMany({
      where,
      orderBy: { createdAt: sort === 'oldest' ? 'asc' : 'desc' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        normalizedEmail: true,
        organizationName: true,
        role: true,
        status: true,
        buildUpdatesPreference: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ leads });
  } catch (error) {
    console.error('Failed to fetch first look leads:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
