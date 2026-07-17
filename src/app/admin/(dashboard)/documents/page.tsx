'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

interface Document {
  id: string;
  title: string;
  originalFilename: string;
  status: string;
  uploadedAt: string;
  onboardingApplication: { id: string; organizationName: string; contactName: string; contactEmail: string };
}

const STATUS_STYLES: Record<string, string> = {
  UPLOADED: 'bg-blue-50 text-blue-700',
  UNDER_REVIEW: 'bg-amber-50 text-amber-700',
  VERIFIED_BY_WGC: 'bg-green-50 text-green-700',
  NEEDS_REPLACEMENT: 'bg-orange-50 text-orange-700',
  REJECTED: 'bg-red-50 text-red-700',
};

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('ALL');

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status !== 'ALL') params.set('status', status);
    fetch(`/api/admin/documents?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        setDocuments(data.documents || []);
        setLoading(false);
      });
  }, [status]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">501(c)(3) Documents</h1>
      <p className="text-sm text-slate-500 mb-6">IRS determination letters submitted during onboarding.</p>

      <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="mb-6 px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none"
      >
        <option value="ALL">All statuses</option>
        <option value="UPLOADED">Uploaded</option>
        <option value="UNDER_REVIEW">Under review</option>
        <option value="VERIFIED_BY_WGC">Approved</option>
        <option value="NEEDS_REPLACEMENT">Needs replacement</option>
        <option value="REJECTED">Rejected</option>
      </select>

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">Loading…</div>
      ) : documents.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">No documents found.</div>
      ) : (
        <div className="space-y-3">
          {documents.map((doc) => (
            <Link
              key={doc.id}
              href={`/admin/documents/${doc.id}`}
              className="block bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-bold text-slate-900">{doc.onboardingApplication.organizationName}</p>
                    <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${STATUS_STYLES[doc.status] || 'bg-slate-100 text-slate-600'}`}>
                      {doc.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">{doc.onboardingApplication.contactName} · {doc.onboardingApplication.contactEmail}</p>
                  <p className="text-sm text-slate-600 mt-2 truncate">{doc.originalFilename}</p>
                </div>
                <p className="text-xs text-slate-400 shrink-0">{new Date(doc.uploadedAt).toLocaleDateString()}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
