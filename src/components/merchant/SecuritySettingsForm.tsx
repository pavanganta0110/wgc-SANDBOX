"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import StateBadge from "@/components/merchant/StateBadge";

const inputClass = "w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-slate-400";

export default function SecuritySettingsForm({ email, lastLoginAt }: { email: string; lastLoginAt: string | null }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const changePassword = async () => {
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords don't match");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/merchant/settings/security/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to change password");
      toast.success("Password changed");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast.error(err.message || "Failed to change password");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8 max-w-md">
      <div>
        <p className="text-xs font-semibold text-slate-500 mb-2">Account</p>
        <div className="text-sm text-slate-700 mb-1">{email}</div>
        <div className="text-xs text-slate-500">
          Last sign-in: {lastLoginAt ? new Date(lastLoginAt).toLocaleString() : "Never"}
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
          <span>Multi-Factor Authentication:</span>
          <StateBadge state="NOT_SUPPORTED" />
        </div>
      </div>

      <div className="pt-6 border-t border-slate-100">
        <p className="text-xs font-semibold text-slate-500 mb-3">Change Password</p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Current Password</label>
            <input type="password" className={inputClass} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">New Password</label>
            <input type="password" className={inputClass} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Confirm New Password</label>
            <input type="password" className={inputClass} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          </div>
        </div>
        <button
          onClick={changePassword}
          disabled={saving || !currentPassword || !newPassword}
          className="mt-4 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-50"
        >
          {saving ? "Saving…" : "Change Password"}
        </button>
      </div>
    </div>
  );
}
