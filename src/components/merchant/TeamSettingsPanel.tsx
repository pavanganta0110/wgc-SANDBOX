"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import StateBadge from "@/components/merchant/StateBadge";
import { isValidEmail } from "@/lib/donors/donorContact";
import { formatCents } from "@/lib/format";

type Role = "owner" | "admin" | "fundraiser" | "viewer" | "church_admin";
const INVITABLE_ROLES: Exclude<Role, "owner" | "church_admin">[] = ["admin", "fundraiser", "viewer"];
const ROLE_LABELS: Record<string, string> = { owner: "Owner", admin: "Admin", fundraiser: "Fundraiser", viewer: "Viewer", church_admin: "Admin" };

interface Member {
  id: string;
  email: string;
  role: string;
  invitationStatus: "PENDING" | "EXPIRED" | "ACCEPTED";
  disabled: boolean;
  mfaStatus: "NOT_SUPPORTED";
  lastActive: string | null;
  isSelf: boolean;
  isPrimaryOwner: boolean;
  permissionOverrides: Record<string, boolean>;
}

interface Metric {
  userId: string;
  email: string;
  activeGivingLinkCount: number;
  transactionCount: number;
  grossAttributedCents: number;
  refundAmountCents: number;
  netAttributedCents: number;
  recurringDonorCount: number;
  lastActivity: string | null;
}

/** Status label shown to the user — Pending / Active / Disabled, per spec. */
function memberStatus(member: Member): "PENDING" | "ACTIVE" | "DISABLED" {
  if (member.disabled) return "DISABLED";
  if (member.invitationStatus === "ACCEPTED") return "ACTIVE";
  return "PENDING";
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
  const [inviteRole, setInviteRole] = useState<(typeof INVITABLE_ROLES)[number]>("fundraiser");
  const [inviting, setInviting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Metric[] | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);

  useEffect(() => {
    if (!canManageTeam) return;
    setMetricsLoading(true);
    fetch("/api/merchant/settings/team/metrics")
      .then((r) => r.json())
      .then((data) => setMetrics(data.metrics || []))
      .catch(() => setMetrics([]))
      .finally(() => setMetricsLoading(false));
  }, [canManageTeam]);

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
        body: JSON.stringify({ email, role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send invitation");
      setMembers((prev) => [...prev, { ...data.member, isSelf: false, isPrimaryOwner: false, permissionOverrides: {} }]);
      setInviteEmail("");
      toast.success(`Invitation sent to ${email} as ${ROLE_LABELS[inviteRole]}`);
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

  const updateRole = async (member: Member, role: string) => {
    setBusyId(member.id);
    try {
      const res = await fetch(`/api/merchant/settings/team/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_role", role, permissionOverrides: member.permissionOverrides }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update role");
      setMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, role: data.member.role, permissionOverrides: data.member.permissionOverrides } : m)));
      toast.success(`Role updated to ${ROLE_LABELS[role]}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to update role");
    } finally {
      setBusyId(null);
    }
  };

  const toggleOverride = async (member: Member, key: string, value: boolean) => {
    const nextOverrides = { ...member.permissionOverrides, [key]: value };
    if (!value) delete nextOverrides[key];
    setBusyId(member.id);
    try {
      const res = await fetch(`/api/merchant/settings/team/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_role", role: member.role, permissionOverrides: nextOverrides }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update permissions");
      setMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, permissionOverrides: data.member.permissionOverrides } : m)));
    } catch (err: any) {
      toast.error(err.message || "Failed to update permissions");
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

  const OVERRIDE_TOGGLES: { key: string; label: string }[] = [
    { key: "canViewAllTransactions", label: "View all organization transactions" },
    { key: "canIssueRefunds", label: "Issue refunds" },
    { key: "canExportReports", label: "Export reports" },
    { key: "canManageRecurring", label: "Manage recurring donations" },
  ];

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
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as any)}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-slate-400"
          >
            {INVITABLE_ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
          <button
            onClick={invite}
            disabled={inviting}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold whitespace-nowrap disabled:opacity-50"
          >
            {inviting ? "Sending…" : "Invite Team Member"}
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold text-slate-500 border-b border-slate-100">
              <th className="py-2 pr-4">Email</th>
              <th className="py-2 pr-4">Role</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Last Active</th>
              {canManageTeam && <th className="py-2 pr-4">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {members.map((member) => {
              const status = memberStatus(member);
              const isEditable = canManageTeam && !member.isPrimaryOwner && member.role !== "owner";
              return (
                <>
                  <tr key={member.id} className="border-b border-slate-50">
                    <td className="py-3 pr-4 font-medium text-slate-900">
                      {member.email}
                      {member.isSelf && <span className="ml-2 text-xs text-slate-400">(You)</span>}
                      {member.isPrimaryOwner && <span className="ml-2 text-xs text-amber-600 font-semibold">Primary Owner</span>}
                    </td>
                    <td className="py-3 pr-4">
                      {isEditable ? (
                        <select
                          value={member.role}
                          disabled={busyId === member.id}
                          onChange={(e) => updateRole(member, e.target.value)}
                          className="px-2 py-1 rounded-lg border border-slate-200 text-xs outline-none focus:border-slate-400 disabled:opacity-50"
                        >
                          {INVITABLE_ROLES.map((r) => (
                            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-slate-700">{ROLE_LABELS[member.role] || member.role}</span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <StateBadge state={status} />
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
                          {isEditable && (
                            <button
                              onClick={() => setEditingId(editingId === member.id ? null : member.id)}
                              className="text-xs font-semibold text-slate-600 hover:underline"
                            >
                              {editingId === member.id ? "Hide Permissions" : "Permissions"}
                            </button>
                          )}
                          {member.invitationStatus === "ACCEPTED" && !member.isSelf && !member.isPrimaryOwner && (
                            <button
                              onClick={() => toggleDisabled(member)}
                              disabled={busyId === member.id}
                              className={`text-xs font-semibold hover:underline disabled:opacity-50 ${
                                member.disabled ? "text-blue-600" : "text-red-600"
                              }`}
                            >
                              {member.disabled ? "Reactivate" : "Disable"}
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                  {editingId === member.id && isEditable && (
                    <tr key={`${member.id}-perms`} className="border-b border-slate-50 bg-slate-50">
                      <td colSpan={5} className="py-3 px-4">
                        <p className="text-xs font-semibold text-slate-500 mb-2">
                          Grant {member.email} extra access beyond their {ROLE_LABELS[member.role]} role defaults:
                        </p>
                        <div className="flex flex-wrap gap-x-6 gap-y-2">
                          {OVERRIDE_TOGGLES.map((t) => (
                            <label key={t.key} className="flex items-center gap-2 text-xs text-slate-700">
                              <input
                                type="checkbox"
                                checked={!!member.permissionOverrides[t.key]}
                                disabled={busyId === member.id}
                                onChange={(e) => toggleOverride(member, t.key, e.target.checked)}
                              />
                              {t.label}
                            </label>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
        {members.length === 0 && <p className="text-sm text-slate-500 py-6 text-center">No team members yet.</p>}
      </div>

      {canManageTeam && (
        <div className="mt-8">
          <h4 className="text-sm font-bold text-slate-900 mb-3">Team Metrics</h4>
          {metricsLoading ? (
            <p className="text-sm text-slate-500">Loading metrics…</p>
          ) : !metrics || metrics.length === 0 ? (
            <p className="text-sm text-slate-500">No attributed activity yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold text-slate-500 border-b border-slate-100">
                    <th className="py-2 pr-4">Member</th>
                    <th className="py-2 pr-4 text-right">Active Links</th>
                    <th className="py-2 pr-4 text-right">Transactions</th>
                    <th className="py-2 pr-4 text-right">Gross</th>
                    <th className="py-2 pr-4 text-right">Refunds</th>
                    <th className="py-2 pr-4 text-right">Net</th>
                    <th className="py-2 pr-4 text-right">Recurring Donors</th>
                    <th className="py-2 pr-4">Last Activity</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.map((m) => (
                    <tr key={m.userId} className="border-b border-slate-50">
                      <td className="py-2 pr-4 font-medium text-slate-900">{m.email}</td>
                      <td className="py-2 pr-4 text-right text-slate-700">{m.activeGivingLinkCount}</td>
                      <td className="py-2 pr-4 text-right text-slate-700">{m.transactionCount}</td>
                      <td className="py-2 pr-4 text-right text-slate-700">{formatCents(m.grossAttributedCents)}</td>
                      <td className="py-2 pr-4 text-right text-slate-700">{formatCents(m.refundAmountCents)}</td>
                      <td className="py-2 pr-4 text-right font-semibold text-slate-900">{formatCents(m.netAttributedCents)}</td>
                      <td className="py-2 pr-4 text-right text-slate-700">{m.recurringDonorCount}</td>
                      <td className="py-2 pr-4 text-slate-500">
                        {m.lastActivity ? new Date(m.lastActivity).toLocaleDateString() : "Never"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
