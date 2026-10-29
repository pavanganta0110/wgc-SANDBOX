"use client";

import { useEffect, useState } from "react";

interface Member {
  id: string;
  email: string;
  name: string | null;
  status: "active" | "invite_pending" | "disabled";
  lastLoginAt: string | null;
  isYou: boolean;
}

const statusText: Record<Member["status"], string> = { active: "Active", invite_pending: "Invitation sent", disabled: "Removed" };
const inputClass = "rounded-lg border border-slate-200 px-3 py-2 text-sm";
const buttonClass = "rounded-lg bg-[#010409] text-white text-sm font-semibold px-4 py-2 disabled:opacity-60";

export default function PartnerTeamPanel() {
  const [members, setMembers] = useState<Member[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/partner/team")
      .then((r) => r.json() as Promise<{ users?: Member[]; error?: string }>)
      .then((d) => {
        if (cancelled) return;
        if (d.error) setMessage({ text: d.error, error: true });
        else setMembers(d.users ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const res = await fetch("/api/partner/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, name }) });
    const body = await res.json().catch(() => ({}));
    setMessage(res.ok ? { text: body.message, error: false } : { text: body.error || "Couldn't send the invitation.", error: true });
    if (res.ok) {
      setEmail("");
      setName("");
      setReloadKey((k) => k + 1);
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/partner/team/${id}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    setMessage(res.ok ? { text: "Access removed.", error: false } : { text: body.error || "Couldn't remove that person.", error: true });
    setReloadKey((k) => k + 1);
  }

  return (
    <div className="space-y-6">
      {message && (
        <p role="status" className={`text-sm ${message.error ? "text-red-600" : "text-green-700"}`}>
          {message.text}
        </p>
      )}
      <form onSubmit={invite} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-wrap gap-3 items-end">
        <div>
          <label htmlFor="team-name" className="block text-xs font-semibold text-slate-600 mb-1">
            Name
          </label>
          <input id="team-name" placeholder=" " value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor="team-email" className="block text-xs font-semibold text-slate-600 mb-1">
            Email
          </label>
          <input id="team-email" type="email" required placeholder=" " value={email} onChange={(e) => setEmail(e.target.value)} className={`${inputClass} w-64`} />
        </div>
        <button type="submit" className={buttonClass}>
          Send invitation
        </button>
      </form>
      <p className="text-xs text-slate-500">Everyone on the account has the same access: your organizations, API key, webhook and billing. Each person signs in with their own password and an emailed code.</p>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-100">
              <th className="px-4 py-3 font-semibold">Person</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Last sign-in</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-3 text-slate-900">
                  <span className="font-semibold">{m.name || m.email}</span>
                  {m.name && <span className="text-slate-500"> · {m.email}</span>}
                  {m.isYou && <span className="ml-2 text-xs text-slate-500">(you)</span>}
                </td>
                <td className="px-4 py-3 text-slate-600">{statusText[m.status]}</td>
                <td className="px-4 py-3 text-slate-600">{m.lastLoginAt ? new Date(m.lastLoginAt).toLocaleString() : "—"}</td>
                <td className="px-4 py-3 text-right">
                  {!m.isYou && m.status !== "disabled" && (
                    <button type="button" onClick={() => remove(m.id)} className="text-xs font-semibold text-red-600">
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
