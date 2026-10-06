"use client";

import { useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  Bookmark,
  CalendarRange,
  FileSpreadsheet,
  Globe2,
  Lock,
  Pencil,
  Play,
  Plus,
  Repeat,
  Trash2,
  UserMinus,
} from "lucide-react";
import PageHeader from "./ui/PageHeader";
import EmptyState from "./ui/EmptyState";
import { FOCUS } from "./ui/controls";

interface SavedReportSummary {
  id: string;
  name: string;
  reportType: string;
  visibility: string;
  isOwner: boolean;
  updatedAt: string;
  summary: string[];
}

const REPORT_TYPE_ROUTE: Record<string, string> = {
  DONORS: "/merchant/reporting/donors",
  ANNUAL: "/merchant/reporting/annual",
  RECURRING: "/merchant/reporting/recurring",
  LAPSED: "/merchant/reporting/lapsed",
};

const TYPE_META: Record<string, { label: string; Icon: typeof Bookmark }> = {
  DONORS: { label: "Donor Report", Icon: FileSpreadsheet },
  ANNUAL: { label: "Annual Giving", Icon: CalendarRange },
  RECURRING: { label: "Recurring Giving", Icon: Repeat },
  LAPSED: { label: "Lapsed Donors", Icon: UserMinus },
};

function updatedAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function SavedReportsList({
  reports: initial,
  canManage,
}: {
  reports: SavedReportSummary[];
  canManage: boolean;
}) {
  const [reports, setReports] = useState(initial);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const handleRename = async (id: string) => {
    if (!renameValue.trim()) return;
    try {
      const res = await fetch(`/api/merchant/reporting/saved/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameValue.trim() }),
      });
      if (!res.ok)
        throw new Error((await res.json()).error || "Rename failed.");
      setReports((prev) =>
        prev.map((r) => (r.id === id ? { ...r, name: renameValue.trim() } : r)),
      );
      setRenamingId(null);
      toast.success("Renamed");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Rename failed.");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/merchant/reporting/saved/${id}`, {
        method: "DELETE",
      });
      if (!res.ok)
        throw new Error((await res.json()).error || "Delete failed.");
      setReports((prev) => prev.filter((r) => r.id !== id));
      setConfirmingId(null);
      toast.success("Deleted");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Delete failed.");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        current="Saved Reports"
        title="Saved Reports"
        subtitle="Report setups only. Results always regenerate fresh from live data when you open one."
        actions={
          canManage && reports.length > 0 ? (
            <Link
              href="/merchant/reporting/donors"
              className={`inline-flex h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 motion-reduce:transition-none ${FOCUS}`}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Create report
            </Link>
          ) : undefined
        }
      />

      {reports.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white">
          <EmptyState
            icon={<Bookmark className="h-5 w-5" />}
            title="No saved reports yet"
            body="Set up a report with the filters and columns you use most, save it, and it will wait for you here. Great for board packets and monthly follow-ups."
            actionLabel="Create your first report"
            actionHref="/merchant/reporting/donors"
          />
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {reports.map((r) => {
            const meta = TYPE_META[r.reportType] ?? {
              label: r.reportType,
              Icon: Bookmark,
            };
            const canEdit =
              canManage && (r.isOwner || r.visibility === "ORGANIZATION");
            const confirming = confirmingId === r.id;
            return (
              <li
                key={r.id}
                className="flex flex-col rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm transition duration-200 hover:border-slate-300 hover:shadow-md motion-reduce:transition-none"
              >
                <div className="flex items-start gap-3">
                  <span
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"
                    aria-hidden
                  >
                    <meta.Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    {renamingId === r.id ? (
                      <input
                        autoFocus
                        aria-label="Report name"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRename(r.id);
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        onBlur={() => handleRename(r.id)}
                        className={`h-9 w-full rounded-lg border border-indigo-300 px-2.5 text-sm font-semibold ${FOCUS}`}
                      />
                    ) : (
                      <Link
                        href={
                          REPORT_TYPE_ROUTE[r.reportType] ??
                          "/merchant/reporting"
                        }
                        className={`block truncate rounded text-sm font-bold text-slate-900 hover:text-indigo-700 ${FOCUS}`}
                      >
                        {r.name}
                      </Link>
                    )}
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                      <span>{meta.label}</span>
                      <span aria-hidden>·</span>
                      <span className="inline-flex items-center gap-1">
                        {r.visibility === "ORGANIZATION" ? (
                          <Globe2 className="h-3 w-3" aria-hidden />
                        ) : (
                          <Lock className="h-3 w-3" aria-hidden />
                        )}
                        {r.visibility === "ORGANIZATION"
                          ? "Whole team"
                          : "Only me"}
                      </span>
                      <span aria-hidden>·</span>
                      <span>Updated {updatedAgo(r.updatedAt)}</span>
                    </p>
                  </div>
                </div>

                {r.summary.length > 0 && (
                  <ul
                    className="mt-4 flex flex-wrap gap-1.5"
                    aria-label="Filters"
                  >
                    {r.summary.map((t) => (
                      <li
                        key={t}
                        className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
                      >
                        {t}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-auto flex items-center justify-between gap-2 pt-5">
                  {confirming ? (
                    <div
                      className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl bg-rose-50 px-3 py-2"
                      role="alertdialog"
                      aria-label={`Delete ${r.name}`}
                    >
                      <span className="text-xs font-semibold text-rose-800">
                        Delete this report? This can&apos;t be undone.
                      </span>
                      <span className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmingId(null)}
                          className={`h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 ${FOCUS}`}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(r.id)}
                          className={`h-8 rounded-lg bg-rose-600 px-3 text-xs font-semibold text-white hover:bg-rose-700 ${FOCUS}`}
                        >
                          Delete
                        </button>
                      </span>
                    </div>
                  ) : (
                    <>
                      <Link
                        href={
                          REPORT_TYPE_ROUTE[r.reportType] ??
                          "/merchant/reporting"
                        }
                        className={`inline-flex h-9 items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 text-sm font-semibold text-white hover:bg-indigo-700 ${FOCUS}`}
                      >
                        <Play className="h-3.5 w-3.5" aria-hidden />
                        Run
                      </Link>
                      {canEdit && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setRenamingId(r.id);
                              setRenameValue(r.name);
                            }}
                            className={`inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 ${FOCUS}`}
                            aria-label={`Rename ${r.name}`}
                          >
                            <Pencil className="h-4 w-4" aria-hidden />
                            Rename
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmingId(r.id)}
                            className={`inline-flex h-9 w-9 items-center justify-center rounded-xl text-rose-600 hover:bg-rose-50 ${FOCUS}`}
                            aria-label={`Delete ${r.name}`}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
