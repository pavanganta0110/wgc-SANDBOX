'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface DocumentDetail {
  id: string;
  originalFilename: string;
  status: string;
  uploadedAt: string;
  internalReviewNotes: string | null;
  organizationFacingMessage: string | null;
  onboardingApplication: { id: string; organizationName: string; contactName: string; contactEmail: string };
}

export default function DocumentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [reviewStatus, setReviewStatus] = useState('VERIFIED_BY_WGC');
  const [internalNotes, setInternalNotes] = useState('');
  const [orgMessage, setOrgMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [accessLoading, setAccessLoading] = useState<'view' | 'download' | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/documents/${id}`)
      .then((res) => {
        if (res.status === 404) {
          setNotFound(true);
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data?.document) {
          setDoc(data.document);
          setInternalNotes(data.document.internalReviewNotes || '');
          setOrgMessage(data.document.organizationFacingMessage || '');
        }
        setLoading(false);
      });
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleAccess(intent: 'view' | 'download') {
    setAccessLoading(intent);
    setError('');
    try {
      const res = await fetch(`/api/admin/documents/${id}/access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setError('Unable to access this document right now.');
        return;
      }
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch {
      setError('Unable to access this document right now.');
    } finally {
      setAccessLoading(null);
    }
  }

  async function handleReview(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/documents/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: reviewStatus,
          internalReviewNotes: internalNotes,
          organizationFacingMessage: orgMessage,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Failed to update document review.');
        return;
      }
      setDoc(data.document);
    } catch {
      setError('Failed to update document review.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="max-w-3xl mx-auto text-sm text-slate-500">Loading…</div>;
  if (notFound || !doc) {
    return (
      <div className="max-w-3xl mx-auto">
        <p className="text-sm text-slate-500 mb-4">Document not found.</p>
        <Link href="/admin/documents" className="text-sm font-semibold text-slate-900 underline">Back to documents</Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <button onClick={() => router.push('/admin/documents')} className="text-sm text-slate-500 hover:text-slate-800 mb-4">
        &larr; Back to documents
      </button>

      <div className="bg-white border border-slate-200 rounded-xl p-6 mb-6">
        <h1 className="text-xl font-bold text-slate-900 mb-1">{doc.onboardingApplication.organizationName}</h1>
        <p className="text-sm text-slate-500 mb-4">
          {doc.onboardingApplication.contactName} · {doc.onboardingApplication.contactEmail}
        </p>
        <p className="text-sm text-slate-700 mb-1"><span className="font-semibold">File:</span> {doc.originalFilename}</p>
        <p className="text-sm text-slate-700 mb-1"><span className="font-semibold">Status:</span> {doc.status.replace(/_/g, ' ')}</p>
        <p className="text-sm text-slate-700 mb-4"><span className="font-semibold">Uploaded:</span> {new Date(doc.uploadedAt).toLocaleString()}</p>

        <div className="flex gap-3">
          <button
            onClick={() => handleAccess('view')}
            disabled={accessLoading !== null}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold disabled:opacity-50"
          >
            {accessLoading === 'view' ? 'Opening…' : 'View'}
          </button>
          <button
            onClick={() => handleAccess('download')}
            disabled={accessLoading !== null}
            className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold disabled:opacity-50"
          >
            {accessLoading === 'download' ? 'Preparing…' : 'Download'}
          </button>
        </div>
      </div>

      <form onSubmit={handleReview} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <h2 className="text-sm font-bold text-slate-900">Review this document</h2>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Decision</label>
          <select
            value={reviewStatus}
            onChange={(e) => setReviewStatus(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none"
          >
            <option value="VERIFIED_BY_WGC">Approve</option>
            <option value="NEEDS_REPLACEMENT">Needs replacement</option>
            <option value="REJECTED">Reject</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Internal review note (not visible to applicant)</label>
          <textarea
            value={internalNotes}
            onChange={(e) => setInternalNotes(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none resize-none"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Message to organization (optional, sent by email)</label>
          <textarea
            value={orgMessage}
            onChange={(e) => setOrgMessage(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none resize-none"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save review'}
        </button>
      </form>
    </div>
  );
}
