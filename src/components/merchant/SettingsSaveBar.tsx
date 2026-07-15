"use client";

import { AlertCircle } from "lucide-react";

export default function SettingsSaveBar({
  isDirty,
  saving,
  error,
  onSave,
  onReset,
}: {
  isDirty: boolean;
  saving: boolean;
  error: string | null;
  onSave: () => void;
  onReset: () => void;
}) {
  if (!isDirty && !error) return null;

  return (
    <div className="sticky bottom-0 -mx-6 px-6 py-3 bg-white border-t border-slate-200 flex items-center justify-between gap-3 mt-6 rounded-b-2xl">
      <div className="flex items-center gap-2 text-sm">
        {error ? (
          <>
            <AlertCircle className="w-4 h-4 text-red-600" />
            <span className="text-red-700">{error}</span>
            <button onClick={onSave} className="font-semibold text-blue-600 hover:underline ml-1">
              Retry
            </button>
          </>
        ) : (
          <span className="text-amber-700 font-semibold">Unsaved changes</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button onClick={onReset} disabled={saving} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          Reset
        </button>
        <button onClick={onSave} disabled={saving} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50">
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
