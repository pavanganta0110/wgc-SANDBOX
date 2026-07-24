'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, User, Building, Mail, Calendar, FileText, CheckCircle, Clock } from 'lucide-react';

interface Note {
  id: string;
  body: string;
  adminUserId: string;
  createdAt: string;
}

interface Activity {
  id: string;
  action: string;
  metadataJson: any;
  createdAt: string;
}

interface Lead {
  id: string;
  publicReference: string;
  firstName: string;
  lastName: string;
  normalizedEmail: string;
  originalEmail: string;
  organizationName: string;
  role: string;
  annualGivingRange: string;
  preferredSessionTime: string;
  painPoint: string | null;
  buildUpdatesPreference: string;
  status: string;
  source: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  submissionCount: number;
  firstSubmittedAt: string;
  lastSubmittedAt: string;
  createdAt: string;
  notes: Note[];
  activity: Activity[];
}

const STATUS_LABELS: Record<string, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  SESSION_SCHEDULED: 'Session Scheduled',
  ATTENDED: 'Attended',
  APPLICATION_STARTED: 'Application Started',
  CONVERTED: 'Converted',
  NOT_INTERESTED: 'Not Interested',
};

const PREF_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  OPTED_IN: 'Weekly Updates',
  SESSION_ONLY: 'Session Only',
};

export default function LeadDetailPage({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = React.use(params);
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [noteBody, setNoteBody] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/first-look-leads/${leadId}`)
      .then(res => res.json())
      .then(data => {
        setLead(data.lead);
        setLoading(false);
      });
  }, [leadId]);

  const handleStatusChange = async (newStatus: string) => {
    if (!lead || updatingStatus) return;
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/admin/first-look-leads/${lead.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        setLead({ ...lead, status: newStatus });
      }
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lead || !noteBody.trim() || addingNote) return;
    
    setAddingNote(true);
    try {
      const res = await fetch(`/api/admin/first-look-leads/${lead.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: noteBody })
      });
      
      if (res.ok) {
        const data = await res.json();
        setLead({
          ...lead,
          notes: [data.note, ...lead.notes]
        });
        setNoteBody('');
      }
    } finally {
      setAddingNote(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading...</div>;
  }

  if (!lead) {
    return <div className="p-8 text-center text-red-500">Lead not found.</div>;
  }

  return (
    <div className="max-w-5xl mx-auto pb-12">
      <Link href="/admin/first-look-leads" className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800 mb-6">
        <ArrowLeft className="w-4 h-4 mr-1" />
        Back to Leads
      </Link>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">{lead.firstName} {lead.lastName}</h1>
          <p className="text-sm text-slate-500">{lead.organizationName} • {lead.role}</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-slate-700">Status:</label>
          <select
            value={lead.status}
            onChange={(e) => handleStatusChange(e.target.value)}
            disabled={updatingStatus}
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm outline-none bg-white font-medium shadow-sm focus:border-blue-400"
          >
            {Object.entries(STATUS_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          {/* Details Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Registration Details</h2>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Email</div>
                <div className="text-slate-900 flex items-center gap-2">
                  <Mail className="w-4 h-4 text-slate-400" />
                  <a href={`mailto:${lead.originalEmail}`} className="text-blue-600 hover:underline">{lead.originalEmail}</a>
                </div>
              </div>
              
              <div>
                <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Organization</div>
                <div className="text-slate-900 flex items-center gap-2">
                  <Building className="w-4 h-4 text-slate-400" />
                  {lead.organizationName}
                </div>
              </div>
              
              <div>
                <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Annual Giving</div>
                <div className="text-slate-900 font-medium">{lead.annualGivingRange}</div>
              </div>
              
              <div>
                <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Preferred Time</div>
                <div className="text-slate-900 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-400" />
                  {lead.preferredSessionTime}
                </div>
              </div>
              
              <div className="sm:col-span-2">
                <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">Current Platform Pain Point</div>
                <div className="text-slate-900 bg-slate-50 p-4 rounded-lg border border-slate-100 text-sm">
                  {lead.painPoint || <span className="italic text-slate-400">No pain point provided.</span>}
                </div>
              </div>
            </div>
          </div>
          
          {/* Notes Section */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Internal Notes</h2>
              
              <form onSubmit={handleAddNote} className="flex flex-col gap-3">
                <textarea
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  placeholder="Add a note about this lead..."
                  className="w-full px-4 py-3 rounded-lg border border-slate-200 text-sm outline-none focus:border-blue-400 min-h-[80px]"
                ></textarea>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={addingNote || !noteBody.trim()}
                    className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"
                  >
                    {addingNote ? 'Adding...' : 'Add Note'}
                  </button>
                </div>
              </form>
            </div>
            
            <div className="divide-y divide-slate-100">
              {lead.notes.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-500">No notes yet.</div>
              ) : (
                lead.notes.map((note) => (
                  <div key={note.id} className="p-6">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center">
                        <User className="w-3 h-3 text-slate-500" />
                      </div>
                      <span className="text-xs font-medium text-slate-900">Admin</span>
                      <span className="text-xs text-slate-400">•</span>
                      <span className="text-xs text-slate-400">{new Date(note.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="text-sm text-slate-700 whitespace-pre-wrap pl-8">{note.body}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        
        <div className="space-y-6">
          {/* Email Preferences */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4 uppercase tracking-wider">Email Preferences</h3>
            <div className="flex items-center gap-3">
              {lead.buildUpdatesPreference === 'OPTED_IN' ? (
                <CheckCircle className="w-5 h-5 text-emerald-500" />
              ) : (
                <Clock className="w-5 h-5 text-slate-400" />
              )}
              <div>
                <div className="font-medium text-slate-900 text-sm">{PREF_LABELS[lead.buildUpdatesPreference] || lead.buildUpdatesPreference}</div>
              </div>
            </div>
          </div>
          
          {/* Metadata */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4 uppercase tracking-wider">Lead Metadata</h3>
            
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Public Ref</dt>
                <dd className="font-mono text-slate-900">{lead.publicReference}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">First Seen</dt>
                <dd className="text-slate-900">{new Date(lead.firstSubmittedAt).toLocaleDateString()}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Submissions</dt>
                <dd className="text-slate-900">{lead.submissionCount}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Source</dt>
                <dd className="text-slate-900">{lead.source || 'Unknown'}</dd>
              </div>
              
              {lead.utmCampaign && (
                <div className="pt-3 mt-3 border-t border-slate-100 space-y-2">
                  <div className="flex justify-between">
                    <dt className="text-slate-500 text-xs">utm_campaign</dt>
                    <dd className="text-slate-900 text-xs">{lead.utmCampaign}</dd>
                  </div>
                  {lead.utmSource && (
                    <div className="flex justify-between">
                      <dt className="text-slate-500 text-xs">utm_source</dt>
                      <dd className="text-slate-900 text-xs">{lead.utmSource}</dd>
                    </div>
                  )}
                  {lead.utmMedium && (
                    <div className="flex justify-between">
                      <dt className="text-slate-500 text-xs">utm_medium</dt>
                      <dd className="text-slate-900 text-xs">{lead.utmMedium}</dd>
                    </div>
                  )}
                </div>
              )}
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
