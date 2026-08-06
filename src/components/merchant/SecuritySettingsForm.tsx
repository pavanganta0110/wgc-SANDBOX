"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import StateBadge from "@/components/merchant/StateBadge";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

const inputClass = "w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-slate-400";

interface Activity {
  id: string;
  action: string;
  createdAt: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export default function SecuritySettingsForm({ email, lastLoginAt }: { email: string; lastLoginAt: string | null }) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  // External Auth state
  const [connectedProviders, setConnectedProviders] = useState<string[]>([]);
  const [hasPassword, setHasPassword] = useState(false);
  const [recentActivity, setRecentActivity] = useState<Activity[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(true);

  const fetchAuthDetails = async () => {
    try {
      const res = await fetch("/api/merchant/settings/security/auth-accounts");
      if (res.ok) {
        const data = await res.json();
        setConnectedProviders(data.connectedProviders || []);
        setHasPassword(data.hasPassword || false);
        setRecentActivity(data.recentActivity || []);
      }
    } catch (err) {
      console.error("Failed to load auth accounts details", err);
    } finally {
      setLoadingDetails(false);
    }
  };

  useEffect(() => {
    fetchAuthDetails();
  }, []);

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
      if (res.status === 403 && data.reauthRequired) {
        toast.error("Reauthentication required for sensitive changes. Redirecting...");
        router.push("/merchant/login?reauth=true&redirectTo=/merchant/settings/security&reauthType=change_password");
        return;
      }
      if (!res.ok) throw new Error(data.error || "Failed to change password");
      toast.success("Password changed");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      fetchAuthDetails();
    } catch (err: any) {
      toast.error(err.message || "Failed to change password");
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async (provider: string) => {
    try {
      const res = await fetch("/api/merchant/settings/security/auth-accounts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });

      const data = await res.json();
      if (res.status === 403 && data.reauthRequired) {
        toast.error("Reauthentication required for sensitive changes. Redirecting...");
        // Redirect to reauth login flow
        router.push(`/merchant/login?reauth=true&redirectTo=/merchant/settings/security&reauthType=disconnect_${provider}`);
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || "Failed to disconnect provider.");
      }

      toast.success(`Successfully disconnected ${provider === "google" ? "Google" : "Apple"}.`);
      fetchAuthDetails();
    } catch (err: any) {
      toast.error(err.message || "An error occurred");
    }
  };

  const handleConnect = (provider: string) => {
    const redirectUrl = encodeURIComponent("/merchant/settings/security");
    router.push(`/api/auth/${provider}?mode=login&redirectTo=${redirectUrl}`);
  };

  if (loadingDetails) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const isGoogleConnected = connectedProviders.includes("google");
  const isAppleConnected = connectedProviders.includes("apple");

  return (
    <div className="space-y-8 max-w-2xl">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
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

        <div>
          <p className="text-xs font-semibold text-slate-500 mb-2">Password Status</p>
          <div className="text-sm text-slate-700 mb-2">
            {hasPassword ? (
              <span className="text-green-600 font-medium">Password set</span>
            ) : (
              <span className="text-amber-600 font-medium">No password set (Social Login only)</span>
            )}
          </div>
        </div>
      </div>

      <div className="pt-6 border-t border-slate-100">
        <p className="text-xs font-semibold text-slate-500 mb-4">Connected Login Methods</p>
        <div className="space-y-4 max-w-md">
          {/* Google */}
          <div className="flex items-center justify-between p-4 border border-slate-100 rounded-2xl bg-slate-50/50">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v3.92h6.69a5.72 5.72 0 0 1-2.48 3.76v3.12h3.99c2.34-2.16 3.69-5.32 3.69-8.73Z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.97-1.08 7.96-2.91l-3.99-3.12c-1.12.75-2.54 1.19-3.97 1.19-3.05 0-5.63-2.06-6.55-4.83H1.4v3.22A12 12 0 0 0 12 24Z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.45 14.33a7.14 7.14 0 0 1 0-4.66V6.45H1.4a12 12 0 0 0 0 11.1l4.05-3.22Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42A12 12 0 0 0 1.4 6.45l4.05 3.22c.92-2.77 3.5-4.83 6.55-4.83Z"
                />
              </svg>
              <div>
                <div className="text-sm font-semibold text-slate-800">Google</div>
                <div className="text-xs text-slate-500">{isGoogleConnected ? "Connected" : "Not connected"}</div>
              </div>
            </div>
            {isGoogleConnected ? (
              <button
                onClick={() => handleDisconnect("google")}
                className="px-3 py-1.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-bold transition-all"
              >
                Disconnect
              </button>
            ) : (
              <button
                onClick={() => handleConnect("google")}
                className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all"
              >
                Connect
              </button>
            )}
          </div>

          {/* Apple */}
          <div className="flex items-center justify-between p-4 border border-slate-100 rounded-2xl bg-slate-50/50">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-black" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.17c.66-.81 1.11-1.93.99-3.06-1 .04-2.15.67-2.87 1.51-.62.71-1.16 1.85-1.02 2.96 1.1.09 2.2-.55 2.9-1.41Z" />
              </svg>
              <div>
                <div className="text-sm font-semibold text-slate-800">Apple</div>
                <div className="text-xs text-slate-500">{isAppleConnected ? "Connected" : "Not connected"}</div>
              </div>
            </div>
            {isAppleConnected ? (
              <button
                onClick={() => handleDisconnect("apple")}
                className="px-3 py-1.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-bold transition-all"
              >
                Disconnect
              </button>
            ) : (
              <button
                onClick={() => handleConnect("apple")}
                className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all"
              >
                Connect
              </button>
            )}
          </div>
        </div>
      </div>

      {hasPassword && (
        <div className="pt-6 border-t border-slate-100 max-w-md">
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
      )}

      {recentActivity.length > 0 && (
        <div className="pt-6 border-t border-slate-100">
          <p className="text-xs font-semibold text-slate-500 mb-3">Recent Authentication Activity</p>
          <div className="overflow-x-auto border border-slate-100 rounded-2xl bg-white">
            <table className="min-w-full divide-y divide-slate-100 text-xs">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-bold text-slate-700">Action</th>
                  <th className="px-4 py-3 text-left font-bold text-slate-700">Date/Time</th>
                  <th className="px-4 py-3 text-left font-bold text-slate-700">IP Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {recentActivity.map((act) => (
                  <tr key={act.id}>
                    <td className="px-4 py-3 font-medium">{act.action}</td>
                    <td className="px-4 py-3">{new Date(act.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3">{act.ipAddress || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
