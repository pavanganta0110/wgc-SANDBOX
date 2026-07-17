'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { ArrowLeft, Loader2 } from 'lucide-react';

interface Inquiry {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  company: string | null;
  role: string | null;
  subject: string | null;
  message: string;
  status: string;
  internalNote: string | null;
  reviewedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUSES = ['NEW', 'REVIEWED', 'CONTACTED', 'CLOSED'];

export default function InquiryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [inquiry, setInquiry] = useState<Inquiry | null>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/inquiries/${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.inquiry) {
          setInquiry(data.inquiry);
          setNote(data.inquiry.internalNote || '');
        }
        setLoading(false);
      });
  }, [id]);

  async function updateStatus(status: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/inquiries/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update status');
      setInquiry(data.inquiry);
      toast.success('Status updated');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveNote() {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/inquiries/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ internalNote: note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save note');
      setInquiry(data.inquiry);
      toast.success('Note saved');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-sm text-slate-500">Loading…</div>;
  if (!inquiry) return <div className="text-sm text-slate-500">Inquiry not found.</div>;

  return (
    <div className="max-w-3xl mx-auto">
      <button onClick={() => router.back()} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800 mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to inquiries
      </button>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{inquiry.firstName} {inquiry.lastName}</h1>
            <a href={`mailto:${inquiry.email}`} className="text-sm text-blue-600 hover:underline">{inquiry.email}</a>
            {inquiry.phone && <span className="text-sm text-slate-500 ml-3">{inquiry.phone}</span>}
          </div>
          <select
            value={inquiry.status}
            disabled={saving}
            onChange={(e) => updateStatus(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-semibold outline-none"
          >
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {(inquiry.company || inquiry.role) && (
          <p className="text-sm text-slate-500 mb-4">
            {inquiry.company}{inquiry.company && inquiry.role ? ' — ' : ''}{inquiry.role}
          </p>
        )}
        {inquiry.subject && <p className="text-sm font-semibold text-slate-700 mb-2">{inquiry.subject}</p>}
        <p className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 rounded-lg p-4">{inquiry.message}</p>

        <p className="text-xs text-slate-400 mt-4">
          Submitted {new Date(inquiry.createdAt).toLocaleString()}
          {inquiry.reviewedBy && ` · Last reviewed by ${inquiry.reviewedBy}`}
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <h2 className="text-sm font-bold text-slate-900 mb-3">Internal note</h2>
        <p className="text-xs text-slate-500 mb-3">Never shown to the applicant.</p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-blue-400"
        />
        <button
          onClick={saveNote}
          disabled={saving}
          className="mt-3 px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 disabled:opacity-50 flex items-center gap-2"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Save note
        </button>
      </div>
    </div>
  );
}
