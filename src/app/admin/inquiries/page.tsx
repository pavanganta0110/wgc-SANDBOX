'use client';

import { useEffect, useState } from 'react';

interface Inquiry {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  company: string | null;
  role: string | null;
  message: string;
  emailSent: boolean;
  emailError: string | null;
  createdAt: string;
}

export default function InquiriesPage() {
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/inquiries')
      .then((res) => res.json())
      .then((data) => {
        setInquiries(data.inquiries || []);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div className="p-8 text-sm text-slate-500">Loading…</div>;
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Contact Inquiries</h1>
      <p className="text-sm text-slate-500 mb-6">Submissions from the public /contact form.</p>

      {inquiries.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
          No inquiries yet.
        </div>
      ) : (
        <div className="space-y-4">
          {inquiries.map((inq) => (
            <div key={inq.id} className="bg-white border border-slate-200 rounded-xl p-6">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-bold text-slate-900">{inq.firstName} {inq.lastName}</p>
                  <div className="flex gap-4 items-center">
                    <a href={`mailto:${inq.email}`} className="text-sm text-blue-600 hover:underline">{inq.email}</a>
                    {inq.phone && <span className="text-xs text-slate-500 font-medium font-mono">{inq.phone}</span>}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400">{new Date(inq.createdAt).toLocaleString()}</p>
                  {inq.emailSent ? (
                    <span className="text-xs font-semibold text-green-600">Email sent</span>
                  ) : (
                    <span className="text-xs font-semibold text-red-600" title={inq.emailError || ''}>Email failed</span>
                  )}
                </div>
              </div>
              {(inq.company || inq.role) && (
                <p className="text-xs text-slate-500 mb-2">
                  {inq.company}{inq.company && inq.role ? ' — ' : ''}{inq.role}
                </p>
              )}
              <p className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 rounded-lg p-3">{inq.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
