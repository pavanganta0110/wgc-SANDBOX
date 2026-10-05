"use client";

import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";
import toast from "react-hot-toast";
import { inputClass, readApiError, secondaryButton } from "@/components/events/merchant/api";
import { formatPhoneForExport } from "@/lib/eventRegistration/eventCsv";

interface Attendee {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  checkedIn: boolean;
  confirmationCode: string;
  groupName: string | null;
  registrantName: string;
  customResponses: Record<string, string | number | boolean>;
}

interface Field {
  id: string;
  label: string;
  type: string;
}

export default function AttendeesTab({
  eventId,
  canManageAttendees,
  canExport,
  onChange,
}: {
  eventId: string;
  canManageAttendees: boolean;
  canExport: boolean;
  onChange: () => void;
}) {
  const [attendees, setAttendees] = useState<Attendee[] | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [checkedIn, setCheckedIn] = useState("");
  const [group, setGroup] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (checkedIn) params.set("checkedIn", checkedIn);
    if (group) params.set("group", group);
    const res = await fetch(`/api/merchant/events/${eventId}/attendees?${params}`, { cache: "no-store" });
    if (!res.ok) return setError(await readApiError(res));
    setError(null);
    const data = await res.json();
    setAttendees(data.attendees);
    setFields(data.fields);
    setGroups(data.groups);
  }, [eventId, q, checkedIn, group]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  async function toggle(a: Attendee) {
    const next = !a.checkedIn;
    // Optimistic: a check-in desk needs the box to respond instantly.
    setAttendees((prev) => prev?.map((x) => (x.id === a.id ? { ...x, checkedIn: next } : x)) ?? prev);
    const res = await fetch(`/api/merchant/events/${eventId}/attendees/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkedIn: next }),
    });
    if (!res.ok) {
      setAttendees((prev) => prev?.map((x) => (x.id === a.id ? { ...x, checkedIn: a.checkedIn } : x)) ?? prev);
      toast.error(await readApiError(res, "Couldn't update check-in."));
      return;
    }
    onChange();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <div className="flex flex-wrap gap-3 w-full sm:w-auto">
          <div className="w-full sm:w-64">
            <label htmlFor="att-search" className="sr-only">Search attendees</label>
            <input id="att-search" className={inputClass} placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div>
            <label htmlFor="att-filter" className="sr-only">Check-in filter</label>
            <select id="att-filter" className={inputClass} value={checkedIn} onChange={(e) => setCheckedIn(e.target.value)}>
              <option value="">All attendees</option>
              <option value="true">Checked in</option>
              <option value="false">Not checked in</option>
            </select>
          </div>
          {groups.length > 0 && (
            <div>
              <label htmlFor="att-group" className="sr-only">Group filter</label>
              <select id="att-group" className={inputClass} value={group} onChange={(e) => setGroup(e.target.value)}>
                <option value="">All groups</option>
                {groups.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        {canExport && (
          <a href={`/api/merchant/events/${eventId}/export`} className={secondaryButton}>
            <Download className="w-4 h-4 mr-1.5" aria-hidden="true" /> Export CSV
          </a>
        )}
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {attendees === null ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : attendees.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center text-sm text-slate-500">No attendees match.</div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Checked in</th>
                {["Attendee", "Email", "Phone", "Group", "Registered by", "Code"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500">{h}</th>
                ))}
                {fields.map((f) => (
                  <th key={f.id} className="px-4 py-3 text-left text-xs font-semibold text-slate-500">{f.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {attendees.map((a) => (
                <tr key={a.id} className={a.checkedIn ? "bg-green-50/40" : ""}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      checked={a.checkedIn}
                      disabled={!canManageAttendees}
                      onChange={() => void toggle(a)}
                      aria-label={`Check in ${a.firstName} ${a.lastName}`}
                    />
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-slate-900 whitespace-nowrap">{a.firstName} {a.lastName}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{a.email ?? "—"}</td>
                  <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">{formatPhoneForExport(a.phone) || "—"}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{a.groupName ?? "—"}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{a.registrantName}</td>
                  <td className="px-4 py-3 text-sm font-mono text-slate-500">{a.confirmationCode}</td>
                  {fields.map((f) => {
                    const v = a.customResponses[f.id];
                    return <td key={f.id} className="px-4 py-3 text-sm text-slate-500">{v === undefined ? "—" : f.type === "CHECKBOX" ? (v ? "Yes" : "No") : String(v)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
