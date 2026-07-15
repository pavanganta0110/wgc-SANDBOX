"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import StateBadge from "@/components/merchant/StateBadge";
import { isValidEmail } from "@/lib/donors/donorContact";

interface Member {
  id: string;
  email: string;
  invitationStatus: "PENDING" | "EXPIRED" | "ACCEPTED";
  disabled: boolean;
  mfaStatus: "NOT_SUPPORTED";
  lastActive: string | null;
  isSelf: boolean;
}

export default function TeamSettingsPanel({
  initialMembers,
  canManageTeam,
}: {
  initialMembers: Member[];
  canManageTeam: boolean;
}) {
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const invite = async () => {
    const email = inviteEmail.trim();
    if (!isValidEmail(email)) {
      toast.error("Enter a valid email address");
      return;
    }
    setInviting(true);
    try {
      const res = await fetch("/api/merchant/settings/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send invitation");
      setMembers((prev) => [...prev, { ...data.member, isSelf: false }]);
      setInviteEmail("");
      toast.success(`Invitation sent to ${email}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to send invitation");
    } finally {
      setInviting(false);
    }
  };

  const toggleDisabled = async (member: Member) => {
    const action = member.disabled ? "enable" : "disable";
    if (action === "disable" && !window.confirm(`Remove dashboard access for ${member.email}?`)) return;
    setBusyId(member.id);
    try {
      const res = await fetch(`/api/merchant/settings/team/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update access");
      setMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, disabled: data.member.disabled } : m)));
      toast.success(action === "disable" ? "Access removed" : "Access restored");
    } catch (err: any) {
      toast.error(err.message || "Failed to update access");
    } finally {
      setBusyId(null);
    }
  };

  const resend = async (member: Member) => {
    setBusyId(member.id);
    try {
      const res = await fetch(`/api/merchant/settings/team/${member.id}/resend`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to resend invitation");
      toast.success(`Invitation resent to ${member.email}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to resend invitation");
    } finally {
      setBusyId(null);
    }
  };

  const removeInvite = async (member: Member) => {
    if (!window.confirm(`Withdraw the pending invitation for ${member.email}?`)) return;
    setBusyId(member.id);
    try {
      const res = await fetch(`/api/merchant/settings/team/${member.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to remove invitation");
      setMembers((prev) => prev.filter((m) => m.id !== member.id));
      toast.success("Invitation withdrawn");
    } catch (err: any) {
      toast.error(err.message || "Failed to remove invitation");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      {canManageTeam && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-6">
          <input
            type="email"
            placeholder="teammate@organization.org"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-slate-400"
          />
          <button
            onClick={invite}
            disabled={inviting}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold whitespace-nowrap disabled:opacity-50"
          >
            {inviting ? "Sending…" : "Invite Organization Admin"}
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold text-slate-500 border-b border-slate-100">
              <th className="py-2 pr-4">Email</th>
              <th className="py-2 pr-4">Invitation Status</th>
              <th className="py-2 pr-4">MFA Status</th>
              <th className="py-2 pr-4">Last Active</th>
              {canManageTeam && <th className="py-2 pr-4">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id} className="border-b border-slate-50">
                <td className="py-3 pr-4 font-medium text-slate-900">
                  {member.email}
                  {member.isSelf && <span className="ml-2 text-xs text-slate-400">(You)</span>}
                </td>
                <td className="py-3 pr-4">
                  <StateBadge state={member.disabled ? "DISABLED" : member.invitationStatus} />
                </td>
                <td className="py-3 pr-4">
                  <StateBadge state="NOT_SUPPORTED" />
                </td>
                <td className="py-3 pr-4 text-slate-500">
                  {member.lastActive ? new Date(member.lastActive).toLocaleDateString() : "Never"}
                </td>
                {canManageTeam && (
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-3">
                      {member.invitationStatus !== "ACCEPTED" && !member.disabled && (
                        <>
                          <button
                            onClick={() => resend(member)}
                            disabled={busyId === member.id}
                            className="text-xs font-semibold text-blue-600 hover:underline disabled:opacity-50"
                          >
                            Resend
                          </button>
                          <button
                            onClick={() => removeInvite(member)}
                            disabled={busyId === member.id}
                            className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-50"
                          >
                            Withdraw
                          </button>
                        </>
                      )}
                      {member.invitationStatus === "ACCEPTED" && !member.isSelf && (
                        <button
                          onClick={() => toggleDisabled(member)}
                          disabled={busyId === member.id}
                          className={`text-xs font-semibold hover:underline disabled:opacity-50 ${
                            member.disabled ? "text-blue-600" : "text-red-600"
                          }`}
                        >
                          {member.disabled ? "Restore Access" : "Remove Access"}
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {members.length === 0 && <p className="text-sm text-slate-500 py-6 text-center">No team members yet.</p>}
      </div>
    </div>
  );
}
