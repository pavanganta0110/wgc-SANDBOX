'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Profile {
  id: string;
  email: string;
  name: string | null;
  role: string;
  lastLoginAt: string | null;
  createdAt: string;
}

export default function AdminProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [nameMessage, setNameMessage] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [nameError, setNameError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [loggingOutAll, setLoggingOutAll] = useState(false);

  useEffect(() => {
    fetch('/api/admin/profile')
      .then((res) => res.json())
      .then((data) => {
        if (data.user) {
          setProfile(data.user);
          setName(data.user.name || '');
        }
      });
  }, []);

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    setSavingName(true);
    setNameError('');
    setNameMessage('');
    try {
      const res = await fetch('/api/admin/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNameError(data.error || 'Failed to update name.');
        return;
      }
      setProfile(data.user);
      setNameMessage('Name updated.');
    } catch {
      setNameError('Failed to update name.');
    } finally {
      setSavingName(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError('');
    setPasswordMessage('');

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }

    setSavingPassword(true);
    try {
      const res = await fetch('/api/admin/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPasswordError(data.error || 'Failed to change password.');
        return;
      }
      setPasswordMessage('Password changed. Your other sessions have been signed out.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      setPasswordError('Failed to change password.');
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleLogoutAll() {
    if (!confirm('This will sign you out of every session, including this one. Continue?')) return;
    setLoggingOutAll(true);
    try {
      await fetch('/api/admin/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logoutAllSessions: true }),
      });
    } finally {
      router.push('/admin/login');
    }
  }

  if (!profile) return <div className="max-w-2xl mx-auto text-sm text-slate-500">Loading…</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">My Profile</h1>

      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <p className="text-sm text-slate-700 mb-1"><span className="font-semibold">Email:</span> {profile.email}</p>
        <p className="text-sm text-slate-700 mb-1">
          <span className="font-semibold">Role:</span> {profile.role === 'wgc_super_admin' ? 'Super Admin' : 'Admin'}
        </p>
        {profile.lastLoginAt && (
          <p className="text-sm text-slate-700">
            <span className="font-semibold">Last login:</span> {new Date(profile.lastLoginAt).toLocaleString()}
          </p>
        )}
      </div>

      <form onSubmit={handleSaveName} className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
        <h2 className="text-sm font-bold text-slate-900">Display name</h2>
        {nameError && <p className="text-sm text-red-600">{nameError}</p>}
        {nameMessage && <p className="text-sm text-green-700">{nameMessage}</p>}
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none"
        />
        <button type="submit" disabled={savingName} className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold disabled:opacity-50">
          {savingName ? 'Saving…' : 'Save name'}
        </button>
      </form>

      <form onSubmit={handleChangePassword} className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
        <h2 className="text-sm font-bold text-slate-900">Change password</h2>
        {passwordError && <p className="text-sm text-red-600">{passwordError}</p>}
        {passwordMessage && <p className="text-sm text-green-700">{passwordMessage}</p>}
        <input
          type="password"
          placeholder="Current password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none"
        />
        <input
          type="password"
          placeholder="New password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none"
        />
        <input
          type="password"
          placeholder="Confirm new password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none"
        />
        <button type="submit" disabled={savingPassword} className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold disabled:opacity-50">
          {savingPassword ? 'Saving…' : 'Change password'}
        </button>
      </form>

      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <h2 className="text-sm font-bold text-slate-900 mb-2">Sessions</h2>
        <p className="text-sm text-slate-500 mb-3">Sign out of this account everywhere, on every device.</p>
        <button
          onClick={handleLogoutAll}
          disabled={loggingOutAll}
          className="px-4 py-2 rounded-lg border border-red-300 text-red-700 text-sm font-semibold disabled:opacity-50"
        >
          {loggingOutAll ? 'Signing out…' : 'Log out of all sessions'}
        </button>
      </div>
    </div>
  );
}
