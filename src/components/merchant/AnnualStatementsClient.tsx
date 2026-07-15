"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { formatCents } from "@/lib/format";
import StateBadge from "@/components/merchant/StateBadge";
import StatementPreviewModal from "@/components/merchant/StatementPreviewModal";

interface Row {
  donorId: string;
  donorName: string;
  donorEmail: string | null;
  donationCount: number;
  recordedTotalCents: number;
  statementId: string | null;
  statementVersion: number;
  statementStatus: string;
  deliveryStatus: string;
  generatedAt: string | null;
  sentAt: string | null;
  hasMissingInfo: boolean;
}

interface Summary {
  eligibleDonors: number;
  statementsGenerated: number;
  statementsSent: number;
  statementsPendingReview: number;
  missingEmail: number;
  failedDelivery: number;
  totalRecordedDonationsCents: number;
}

const currentYear = new Date().getFullYear();

interface Filters {
  statementStatus: string;
  deliveryStatus: string;
  name: string;
  missing: boolean;
  minAmount: string;
}

const EMPTY_FILTERS: Filters = { statementStatus: "", deliveryStatus: "", name: "", missing: false, minAmount: "" };

interface BulkJob {
  id: string;
  jobType: "GENERATE" | "SEND";
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  totalCount: number;
  processedCount: number;
  succeededCount: number;
  failedCount: number;
  needsReviewCount: number;
  skippedCount: number;
}

export default function AnnualStatementsClient() {
  const [year, setYear] = useState(currentYear - 1);
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewing, setPreviewing] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [nameInput, setNameInput] = useState("");
  const [job, setJob] = useState<BulkJob | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ year: String(year) });
      if (filters.statementStatus) params.set("statementStatus", filters.statementStatus);
      if (filters.deliveryStatus) params.set("deliveryStatus", filters.deliveryStatus);
      if (filters.name) params.set("name", filters.name);
      if (filters.missing) params.set("missing", "1");
      if (filters.minAmount) params.set("minAmount", filters.minAmount);
      const res = await fetch(`/api/merchant/donors/annual-statements?${params.toString()}`);
      const data = await res.json();
      setRows(data.rows ?? []);
      setSummary(data.summary ?? null);
      setSelected(new Set());
    } catch {
      toast.error("Failed to load annual statements");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, filters]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (nameInput !== filters.name) setFilters((f) => ({ ...f, name: nameInput }));
    }, 400);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nameInput]);

  const toggleAll = () => {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.donorId)));
  };
  const toggleOne = (donorId: string) => {
    const next = new Set(selected);
    if (next.has(donorId)) next.delete(donorId);
    else next.add(donorId);
    setSelected(next);
  };

  const generateSelected = async () => {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      const res = await fetch("/api/merchant/donors/annual-statements/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taxYear: year, donorIds: [...selected] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate");
      toast.success(`Generated ${data.generated} statement(s)${data.needsReview ? ` (${data.needsReview} need review)` : ""}${data.failed ? `, ${data.failed} failed` : ""}`);
      await load();
    } catch (err: any) {
      toast.error(err.message || "Failed to generate statements");
    } finally {
      setBusy(false);
    }
  };

  /** Runs a job to completion by repeatedly calling the "process one chunk" route — no persistent background worker exists, so the browser tab drives progress while state lives in BulkStatementJob and survives a reload. */
  const runJob = async (jobType: "GENERATE" | "SEND", targetIds: string[]) => {
    if (targetIds.length === 0) return;
    setBusy(true);
    try {
      const createRes = await fetch("/api/merchant/donors/annual-statements/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taxYear: year, jobType, targetIds }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) throw new Error(createData.error || "Failed to start job");
      let current: BulkJob = createData.job;
      setJob(current);

      while (current.status === "PENDING" || current.status === "RUNNING") {
        const stepRes = await fetch(`/api/merchant/donors/annual-statements/jobs/${current.id}/process`, { method: "POST" });
        const stepData = await stepRes.json();
        if (!stepRes.ok) throw new Error(stepData.error || "Job failed");
        current = stepData.job;
        setJob(current);
      }

      if (jobType === "GENERATE") {
        toast.success(`Generated ${current.succeededCount} statement(s)${current.needsReviewCount ? ` (${current.needsReviewCount} need review)` : ""}${current.failedCount ? `, ${current.failedCount} failed` : ""}`);
      } else {
        toast.success(`Sent ${current.succeededCount}${current.failedCount ? `, ${current.failedCount} failed` : ""}${current.skippedCount ? `, ${current.skippedCount} need review` : ""}`);
      }
      await load();
    } catch (err: any) {
      toast.error(err.message || "Job failed");
    } finally {
      setBusy(false);
      setJob(null);
    }
  };

  const generateAllEligible = async () => {
    setSelected(new Set(rows.map((r) => r.donorId)));
    await runJob("GENERATE", rows.map((r) => r.donorId));
  };

  const sendSelected = async () => {
    const statementIds = rows.filter((r) => selected.has(r.donorId) && r.statementId).map((r) => r.statementId!) as string[];
    if (statementIds.length === 0) {
      toast.error("Generate statements before sending");
      return;
    }
    if (!window.confirm(`Send ${statementIds.length} statement(s) by email? This cannot be undone.`)) return;
    await runJob("SEND", statementIds);
  };

  const generateOne = async (donorId: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/merchant/donors/${donorId}/statements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taxYear: year }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate");
      toast.success("Statement generated");
      await load();
    } catch (err: any) {
      toast.error(err.message || "Failed to generate statement");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <h2 className="text-lg font-bold text-slate-900">Annual Donation Statements</h2>
        <select value={year} onChange={(e) => setYear(parseInt(e.target.value, 10))} className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm outline-none">
          {Array.from({ length: 6 }).map((_, i) => {
            const y = currentYear - i;
            return <option key={y} value={y}>{y}</option>;
          })}
        </select>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
          {(
            [
              ["Eligible Donors", summary.eligibleDonors, null],
              ["Statements Generated", summary.statementsGenerated, null],
              ["Statements Sent", summary.statementsSent, { deliveryStatus: "SENT" }],
              ["Pending Review", summary.statementsPendingReview, { statementStatus: "NEEDS_REVIEW" }],
              ["Missing Email", summary.missingEmail, { missing: true }],
              ["Failed Delivery", summary.failedDelivery, { deliveryStatus: "FAILED" }],
              ["Total Recorded", formatCents(summary.totalRecordedDonationsCents), null],
            ] as [string, string | number, Partial<Filters> | null][]
          ).map(([label, value, filterPatch]) => (
            <button
              key={label}
              onClick={() => filterPatch && setFilters({ ...EMPTY_FILTERS, ...filterPatch })}
              disabled={!filterPatch}
              className={`bg-white rounded-2xl border shadow-sm p-3 text-left ${
                filterPatch ? "border-slate-100 hover:border-slate-300 cursor-pointer" : "border-slate-100 cursor-default"
              }`}
            >
              <p className="text-xs text-slate-500 mb-1">{label}</p>
              <p className="text-lg font-bold text-slate-900">{value}</p>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <select value={filters.statementStatus} onChange={(e) => setFilters((f) => ({ ...f, statementStatus: e.target.value }))} className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm outline-none">
          <option value="">Any Statement Status</option>
          <option value="NOT_GENERATED">Not Generated</option>
          <option value="NEEDS_REVIEW">Needs Review</option>
          <option value="READY">Ready</option>
          <option value="GENERATED">Generated</option>
        </select>
        <select value={filters.deliveryStatus} onChange={(e) => setFilters((f) => ({ ...f, deliveryStatus: e.target.value }))} className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm outline-none">
          <option value="">Any Delivery Status</option>
          <option value="NOT_SENT">Not Sent</option>
          <option value="SENT">Sent</option>
          <option value="FAILED">Failed</option>
        </select>
        <input
          type="text"
          placeholder="Donor name"
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm outline-none w-40"
        />
        <input
          type="text"
          placeholder="Min amount ($)"
          value={filters.minAmount}
          onChange={(e) => setFilters((f) => ({ ...f, minAmount: e.target.value }))}
          className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm outline-none w-32"
        />
        <label className="flex items-center gap-1.5 text-sm text-slate-700">
          <input type="checkbox" checked={filters.missing} onChange={(e) => setFilters((f) => ({ ...f, missing: e.target.checked }))} />
          Missing information only
        </label>
        {(filters.statementStatus || filters.deliveryStatus || filters.name || filters.missing || filters.minAmount) && (
          <button
            onClick={() => {
              setFilters(EMPTY_FILTERS);
              setNameInput("");
            }}
            className="text-sm font-semibold text-slate-500 hover:text-slate-800"
          >
            Clear Filters
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 mb-4">
        <button onClick={generateSelected} disabled={busy || selected.size === 0} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50">
          Generate for Selected ({selected.size})
        </button>
        <button onClick={generateAllEligible} disabled={busy || rows.length === 0} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          Generate for All Eligible
        </button>
        <button onClick={sendSelected} disabled={busy || selected.size === 0} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          Send to Selected
        </button>
      </div>

      {job && (
        <div className="mb-4 bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-2 text-sm">
            <span className="font-semibold text-slate-800">
              {job.jobType === "GENERATE" ? "Generating" : "Sending"} statements — {job.processedCount} of {job.totalCount}
            </span>
            <span className="text-slate-400">{job.status}</span>
          </div>
          <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full bg-slate-900 transition-all"
              style={{ width: `${job.totalCount ? Math.round((job.processedCount / job.totalCount) * 100) : 0}%` }}
            />
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
        {loading ? (
          <p className="px-6 py-10 text-center text-sm text-slate-400">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <h3 className="text-sm font-bold text-slate-900 mb-1">No eligible donors</h3>
            <p className="text-sm text-slate-500">No donors have qualifying completed donations for {year}.</p>
          </div>
        ) : (
          <table className="w-full text-sm min-w-[1200px]">
            <thead>
              <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50">
                <th className="px-4 py-3"><input type="checkbox" checked={selected.size === rows.length && rows.length > 0} onChange={toggleAll} /></th>
                <th className="px-4 py-3">Donor</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3 text-right">Donations</th>
                <th className="px-4 py-3 text-right">Recorded Total</th>
                <th className="px-4 py-3">Statement Status</th>
                <th className="px-4 py-3">Delivery Status</th>
                <th className="px-4 py-3">Sent At</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.donorId} className="border-t border-slate-50">
                  <td className="px-4 py-3"><input type="checkbox" checked={selected.has(r.donorId)} onChange={() => toggleOne(r.donorId)} /></td>
                  <td className="px-4 py-3">
                    <Link href={`/merchant/donors/${r.donorId}`} className="font-semibold text-slate-800 hover:underline">{r.donorName}</Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.donorEmail || <span className="text-amber-600">Missing</span>}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{r.donationCount}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatCents(r.recordedTotalCents)}</td>
                  <td className="px-4 py-3"><StateBadge state={r.statementStatus} /></td>
                  <td className="px-4 py-3"><StateBadge state={r.deliveryStatus} /></td>
                  <td className="px-4 py-3 text-slate-500">{r.sentAt ? new Date(r.sentAt).toLocaleDateString() : "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {!r.statementId ? (
                        <button onClick={() => generateOne(r.donorId)} disabled={busy} className="text-xs font-semibold text-blue-600 hover:underline">Generate</button>
                      ) : (
                        <button onClick={() => setPreviewing(r)} className="text-xs font-semibold text-blue-600 hover:underline">Preview</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {previewing && previewing.statementId && (
        <StatementPreviewModal
          donorId={previewing.donorId}
          statementId={previewing.statementId}
          donorName={previewing.donorName}
          donorEmail={previewing.donorEmail}
          taxYear={year}
          donationCount={previewing.donationCount}
          recordedTotalCents={previewing.recordedTotalCents}
          version={previewing.statementVersion}
          canSend={previewing.statementStatus !== "NEEDS_REVIEW"}
          onClose={() => setPreviewing(null)}
          onSent={load}
        />
      )}
    </div>
  );
}
