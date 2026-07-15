"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import SettingsSaveBar from "@/components/merchant/SettingsSaveBar";
import { useUnsavedChangesWarning } from "@/lib/settings/useUnsavedChanges";

interface Preference {
  key: string;
  label: string;
  description: string;
  inAppEnabled: boolean;
  emailEnabled: boolean;
  frequency: string;
}

export default function NotificationSettingsForm({ initial }: { initial: Preference[] }) {
  const [values, setValues] = useState<Preference[]>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDirty = JSON.stringify(values) !== JSON.stringify(initial);
  useUnsavedChangesWarning(isDirty);

  const update = (key: string, patch: Partial<Preference>) => {
    setValues((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/merchant/settings/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferences: values.map((v) => ({
            eventKey: v.key,
            inAppEnabled: v.inAppEnabled,
            emailEnabled: v.emailEnabled,
            frequency: v.frequency,
          })),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }
      toast.success("Notification preferences saved");
      initial.splice(0, initial.length, ...values);
    } catch (err: any) {
      setError(err.message || "Failed to save preferences");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold text-slate-500 border-b border-slate-100">
              <th className="py-2 pr-4">Event</th>
              <th className="py-2 pr-4 text-center">In-App</th>
              <th className="py-2 pr-4 text-center">Email</th>
              <th className="py-2 pr-4">Frequency</th>
            </tr>
          </thead>
          <tbody>
            {values.map((pref) => (
              <tr key={pref.key} className="border-b border-slate-50 align-top">
                <td className="py-3 pr-4">
                  <div className="font-medium text-slate-900">{pref.label}</div>
                  <div className="text-xs text-slate-500">{pref.description}</div>
                </td>
                <td className="py-3 pr-4 text-center">
                  <input type="checkbox" checked={pref.inAppEnabled} onChange={(e) => update(pref.key, { inAppEnabled: e.target.checked })} />
                </td>
                <td className="py-3 pr-4 text-center">
                  <input type="checkbox" checked={pref.emailEnabled} onChange={(e) => update(pref.key, { emailEnabled: e.target.checked })} />
                </td>
                <td className="py-3 pr-4">
                  <select
                    value={pref.frequency}
                    disabled={!pref.emailEnabled}
                    onChange={(e) => update(pref.key, { frequency: e.target.value })}
                    className="px-2 py-1 rounded-lg border border-slate-200 text-xs outline-none focus:border-slate-400 disabled:opacity-50"
                  >
                    <option value="IMMEDIATE">Immediate</option>
                    <option value="DAILY_DIGEST">Daily Digest</option>
                    <option value="WEEKLY_DIGEST">Weekly Digest</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SettingsSaveBar isDirty={isDirty} saving={saving} error={error} onSave={save} onReset={() => setValues(initial)} />
    </div>
  );
}
