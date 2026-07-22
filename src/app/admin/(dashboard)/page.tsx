'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Summary {
  inquiries: { total: number; new: number; contacted: number };
  documents: { total: number; underReview: number; approved: number };
  tickets: { openCount: number; unreadMerchantReplyCount: number };
  recentInquiries: { id: string; firstName: string; lastName: string; company: string | null; status: string; createdAt: string }[];
  recentDocuments: { id: string; originalFilename: string; status: string; uploadedAt: string; onboardingApplication: { organizationName: string } }[];
  recentTickets: { id: string; ticketNumber: string; subject: string; status: string; priority: string; updatedAt: string }[];
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

export default function AdminDashboardHome() {
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    fetch('/api/admin/dashboard-summary')
      .then((res) => res.json())
      .then(setSummary);
  }, []);

  if (!summary) {
    return <div className="text-sm text-slate-500">Loading…</div>;
  }

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <StatCard label="Total inquiries" value={summary.inquiries.total} />
        <StatCard label="New inquiries" value={summary.inquiries.new} />
        <StatCard label="Contacted" value={summary.inquiries.contacted} />
        <StatCard label="Total documents" value={summary.documents.total} />
        <StatCard label="Under review" value={summary.documents.underReview} />
        <StatCard label="Approved" value={summary.documents.approved} />
        <StatCard label="Open tickets" value={summary.tickets.openCount} />
        <StatCard label="Unread merchant replies" value={summary.tickets.unreadMerchantReplyCount} />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-900">Recent inquiries</h2>
            <Link href="/admin/inquiries" className="text-xs font-semibold text-slate-500 hover:text-slate-800">View all</Link>
          </div>
          {summary.recentInquiries.length === 0 ? (
            <p className="text-sm text-slate-500">No inquiries yet.</p>
          ) : (
            <ul className="space-y-3">
              {summary.recentInquiries.map((inq) => (
                <li key={inq.id}>
                  <Link href={`/admin/inquiries/${inq.id}`} className="block text-sm hover:text-slate-900">
                    <span className="font-semibold text-slate-900">{inq.firstName} {inq.lastName}</span>
                    {inq.company ? <span className="text-slate-500"> · {inq.company}</span> : null}
                    <span className="text-slate-400"> · {new Date(inq.createdAt).toLocaleDateString()}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-900">Recent documents</h2>
            <Link href="/admin/documents" className="text-xs font-semibold text-slate-500 hover:text-slate-800">View all</Link>
          </div>
          {summary.recentDocuments.length === 0 ? (
            <p className="text-sm text-slate-500">No documents yet.</p>
          ) : (
            <ul className="space-y-3">
              {summary.recentDocuments.map((doc) => (
                <li key={doc.id}>
                  <Link href={`/admin/documents/${doc.id}`} className="block text-sm hover:text-slate-900">
                    <span className="font-semibold text-slate-900">{doc.onboardingApplication.organizationName}</span>
                    <span className="text-slate-500"> · {doc.originalFilename}</span>
                    <span className="text-slate-400"> · {new Date(doc.uploadedAt).toLocaleDateString()}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-900">Recent support tickets</h2>
            <Link href="/admin/support/tickets" className="text-xs font-semibold text-slate-500 hover:text-slate-800">View all</Link>
          </div>
          {summary.recentTickets.length === 0 ? (
            <p className="text-sm text-slate-500">No tickets yet.</p>
          ) : (
            <ul className="space-y-3">
              {summary.recentTickets.map((t) => (
                <li key={t.id}>
                  <Link href={`/admin/support/tickets/${t.id}`} className="block text-sm hover:text-slate-900">
                    <span className="font-mono text-xs text-slate-400">{t.ticketNumber}</span>{' '}
                    <span className="font-semibold text-slate-900">{t.subject}</span>
                    <span className="text-slate-400"> · {new Date(t.updatedAt).toLocaleDateString()}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
