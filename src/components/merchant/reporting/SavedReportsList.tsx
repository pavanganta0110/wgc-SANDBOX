"use client";

import { useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Pencil, Trash2 } from "lucide-react";

interface SavedReportSummary {
  id: string;
  name: string;
  reportType: string;
  visibility: string;
  isOwner: boolean;
  updatedAt: string;
}

const REPORT_TYPE_ROUTE: Record<string, string> = {
  DONORS: "/merchant/reporting/donors",
  ANNUAL: "/merchant/reporting/annual",
  RECURRING: "/merchant/reporting/recurring",
  LAPSED: "/merchant/reporting/lapsed",
};

export default function SavedReportsList({ reports: initial, canManage }: { reports: SavedReportSummary[]; canManage: boolean }) {
  const [reports, setReports] = useState(initial);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const handleRename = async (id: string) => {
    if (!renameValue.trim()) return;
    try {
      const res = await fetch(`/api/merchant/reporting/saved/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameValue.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Rename failed.");
      setReports((prev) => prev.map((r) => (r.id === id ? { ...r, name: renameValue.trim() } : r)));
      setRenamingId(null);
      toast.success("Renamed");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Rename failed.");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this saved report? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/merchant/reporting/saved/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "Delete failed.");
      setReports((prev) => prev.filter((r) => r.id !== id));
      toast.success("Deleted");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Delete failed.");
    }
  };

  if (reports.length === 0) {
    return <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center text-sm text-slate-400">No saved reports yet. Build a report and click "Save Report" to add one here.</div>;
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-50">
      {reports.map((r) => (
        <div key={r.id} className="flex items-center justify-between px-5 py-4">
          <div className="min-w-0">
            {renamingId === r.id ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRename(r.id)}
                onBlur={() => handleRename(r.id)}
                className="px-2 py-1 rounded-lg border border-slate-200 text-sm"
              />
            ) : (
              <Link href={REPORT_TYPE_ROUTE[r.reportType] ?? "/merchant/reporting"} className="text-sm font-semibold text-slate-900 hover:underline">
                {r.name}
              </Link>
            )}
            <p className="text-xs text-slate-400 mt-0.5">
              {r.reportType} · {r.visibility === "ORGANIZATION" ? "Whole Team" : "Only Me"} · Updated {new Date(r.updatedAt).toLocaleDateString()}
            </p>
          </div>
          {canManage && (r.isOwner || r.visibility === "ORGANIZATION") && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  setRenamingId(r.id);
                  setRenameValue(r.name);
                }}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
                aria-label="Rename"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button onClick={() => handleDelete(r.id)} className="p-1.5 rounded-lg hover:bg-slate-100 text-red-500" aria-label="Delete">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
