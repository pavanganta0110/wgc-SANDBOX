import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/auth/session';

export async function GET(req: Request) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const leads = await prisma.firstLookLead.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const headers = [
      'ID',
      'Public Reference',
      'First Name',
      'Last Name',
      'Original Email',
      'Organization',
      'Role',
      'Annual Giving',
      'Preferred Time',
      'Pain Point',
      'Build Updates Preference',
      'Status',
      'Source',
      'UTM Source',
      'UTM Medium',
      'UTM Campaign',
      'Submissions',
      'Created At'
    ];

    const rows = leads.map(lead => [
      lead.id,
      lead.publicReference,
      lead.firstName,
      lead.lastName,
      lead.originalEmail,
      lead.organizationName,
      lead.role,
      lead.annualGivingRange,
      lead.preferredSessionTime,
      lead.painPoint || '',
      lead.buildUpdatesPreference,
      lead.status,
      lead.source || '',
      lead.utmSource || '',
      lead.utmMedium || '',
      lead.utmCampaign || '',
      lead.submissionCount.toString(),
      lead.createdAt.toISOString()
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="first_look_leads.csv"',
      },
    });
  } catch (error) {
    console.error('Failed to export leads:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
