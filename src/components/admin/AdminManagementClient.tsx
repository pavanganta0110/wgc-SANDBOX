'use client';

import { useEffect, useState, useCallback } from 'react';

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  invitationStatus: 'PENDING' | 'EXPIRED' | 'ACCEPTED';
  disabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export default function AdminManagementClient() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<'wgc_admin' | 'wgc_super_admin'>('wgc_admin');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/settings/admins')
      .then((res) => res.json())
      .then((data) => {
        if (data.admins) setAdmins(data.admins);
        else setError(data.error || 'Failed to load admins.');
        setLoading(false);
      });
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    setInviteError('');
    try {
      const res = await fetch('/api/admin/settings/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, name: inviteName, role: inviteRole }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setInviteError(data.error || 'Failed to invite admin.');
        return;
      }
      setInviteEmail('');
      setInviteName('');
      setInviteRole('wgc_admin');
      load();
    } catch {
      setInviteError('Failed to invite admin.');
    } finally {
      setInviting(false);
    }
  }

  async function runAction(id: string, action: string, confirmMessage?: string) {
    if (confirmMessage && !confirm(confirmMessage)) return;
    setBusyId(id);
    setError('');
    try {
      const res = await fetch(`/api/admin/settings/admins/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Action failed.');
        return;
      }
      load();
    } catch {
      setError('Action failed.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 mb-1">Admin Users</h1>
        <p className="text-sm text-slate-500">Manage who can access the WGC Payments Admin Dashboard.</p>
      </div>

      <form onSubmit={handleInvite} className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
        <h2 className="text-sm font-bold text-slate-900">Invite a new admin</h2>
        {inviteError && <p className="text-sm text-red-600">{inviteError}</p>}
        <div className="grid sm:grid-cols-3 gap-3">
          <input
            type="email"
            placeholder="Email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            required
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none"
          />
          <input
            type="text"
            placeholder="Name (optional)"
            value={inviteName}
            onChange={(e) => setInviteName(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none"
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as 'wgc_admin' | 'wgc_super_admin')}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none"
          >
            <option value="wgc_admin">Admin</option>
            <option value="wgc_super_admin">Super Admin</option>
          </select>
        </div>
        <button type="submit" disabled={inviting} className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold disabled:opacity-50">
          {inviting ? 'Sending invite…' : 'Send invite'}
        </button>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">Loading…</div>
      ) : admins.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">No admins yet.</div>
      ) : (
        <div className="space-y-3">
          {admins.map((admin) => (
            <div key={admin.id} className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-bold text-slate-900">{admin.name || admin.email}</p>
                    <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      {admin.role === 'wgc_super_admin' ? 'Super Admin' : 'Admin'}
                    </span>
                    {admin.disabled && (
                      <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-red-50 text-red-700">Disabled</span>
                    )}
                    {!admin.disabled && admin.invitationStatus !== 'ACCEPTED' && (
                      <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                        Invite {admin.invitationStatus.toLowerCase()}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">{admin.email}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {admin.lastLoginAt ? `Last login ${new Date(admin.lastLoginAt).toLocaleString()}` : 'Never logged in'}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {admin.invitationStatus !== 'ACCEPTED' && (
                    <>
                      <button
                        disabled={busyId === admin.id}
                        onClick={() => runAction(admin.id, 'resend-invite')}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold disabled:opacity-50"
                      >
                        Resend invite
                      </button>
                      <button
                        disabled={busyId === admin.id}
                        onClick={() => runAction(admin.id, 'revoke-invite', 'Revoke this pending invitation?')}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold disabled:opacity-50"
                      >
                        Revoke invite
                      </button>
                    </>
                  )}
                  {admin.role === 'wgc_admin' ? (
                    <button
                      disabled={busyId === admin.id}
                      onClick={() => runAction(admin.id, 'promote', 'Promote this admin to Super Admin?')}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold disabled:opacity-50"
                    >
                      Promote to Super Admin
                    </button>
                  ) : (
                    <button
                      disabled={busyId === admin.id}
                      onClick={() => runAction(admin.id, 'demote', 'Demote this Super Admin to Admin?')}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold disabled:opacity-50"
                    >
                      Demote to Admin
                    </button>
                  )}
                  {admin.disabled ? (
                    <button
                      disabled={busyId === admin.id}
                      onClick={() => runAction(admin.id, 'reactivate')}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold disabled:opacity-50"
                    >
                      Reactivate
                    </button>
                  ) : (
                    <button
                      disabled={busyId === admin.id}
                      onClick={() => runAction(admin.id, 'disable', 'Disable this admin? They will be signed out and unable to log in.')}
                      className="px-3 py-1.5 rounded-lg border border-red-300 text-red-700 text-xs font-semibold disabled:opacity-50"
                    >
                      Disable
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
