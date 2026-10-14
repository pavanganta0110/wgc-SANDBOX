"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Loader2, RefreshCw, UserPlus, Users } from "lucide-react";
import type { PeopleJobSummary, PeopleOverview } from "@/lib/integrations/planningcenter/peopleTypes";
import { buttonSecondary, PcoApiError, pcoFetch } from "./planningCenterApi";

const MAX_JOB_STEPS = 2000; // a runaway guard, not a limit anyone should reach

function JobProgress({ job }: { job: PeopleJobSummary }) {
  const pct = job.totalCount ? Math.min(100, Math.round((job.processedCount / job.totalCount) * 100)) : null;
  return (
    <div className="text-xs text-slate-600" aria-live="polite">
      {job.status === "COMPLETED" ? "Finished" : job.status === "FAILED" ? "Stopped" : "Working"} · {job.processedCount}
      {job.totalCount ? ` of ${job.totalCount}` : ""} checked
      {job.type === "MATCH_DONORS"
        ? ` · ${job.linkedCount} linked · ${job.reviewCount} to review · ${job.noMatchCount} not found`
        : ` · ${job.createdCount} added · ${job.linkedCount} linked · ${job.skippedCount} skipped`}
      {job.failedCount ? ` · ${job.failedCount} couldn't be processed` : ""}
      {job.lastError && <span className="block text-red-600 mt-0.5">{job.lastError}</span>}
      {pct !== null && job.status === "RUNNING" && (
        <div className="mt-1 h-1.5 w-full max-w-xs rounded bg-slate-100"><div className="h-1.5 rounded bg-slate-700" style={{ width: `${pct}%` }} /></div>
      )}
    </div>
  );
}

export default function PlanningCenterPeople() {
  const [data, setData] = useState<PeopleOverview | null>(null);
  const [hidden, setHidden] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [live, setLive] = useState<PeopleJobSummary | null>(null);

  const load = useCallback(() => {
    return pcoFetch<PeopleOverview>("/people")
      .then((next) => {
        setData(next);
        setLoadError(null);
        setHidden(false);
      })
      .catch((err) => {
        if (err instanceof PcoApiError && (err.status === 404 || err.status === 409)) {
          setHidden(true);
          setData(null);
          return;
        }
        setLoadError(err instanceof Error ? err.message : "Could not load people.");
      });
  }, []);

  useEffect(() => {
    load();
    const onChange = () => load();
    window.addEventListener("pco-connection-changed", onChange);
    return () => window.removeEventListener("pco-connection-changed", onChange);
  }, [load]);

  const act = async (key: string, work: () => Promise<string | void>) => {
    setBusy(key);
    try {
      const message = await work();
      if (message) toast.success(message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      await load();
      setBusy(null);
    }
  };

  const runJob = (type: "MATCH_DONORS" | "IMPORT_PEOPLE") =>
    act(type, async () => {
      const started = await pcoFetch<{ jobId: string }>("/people/jobs", { method: "POST", body: JSON.stringify({ type }) });
      let last: PeopleJobSummary | null = null;
      for (let i = 0; i < MAX_JOB_STEPS; i++) {
        const step = await pcoFetch<{ job: PeopleJobSummary }>(`/people/jobs/${started.jobId}/process`, { method: "POST" });
        last = step.job;
        setLive(last);
        if (last.status === "COMPLETED" || last.status === "FAILED") break;
      }
      setLive(null);
      if (last?.status === "FAILED") throw new Error(last.lastError || "The job stopped.");
      return type === "MATCH_DONORS" ? `Checked ${last?.processedCount ?? 0} donors.` : `Imported ${last?.createdCount ?? 0} new people.`;
    });

  const link = (donorId: string, action: string, pcoPersonId?: string, success?: string) =>
    act(`${action}-${donorId}-${pcoPersonId ?? ""}`, async () => {
      await pcoFetch("/people/links", { method: "PUT", body: JSON.stringify({ action, donorId, ...(pcoPersonId ? { pcoPersonId } : {}) }) });
      return success;
    });

  if (hidden) return null;
  if (loadError && !data) {
    return (
      <div id="planning-center-people" className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h3 className="text-sm font-bold text-slate-900 mb-2">People</h3>
        <p className="text-xs text-red-600 mb-3">{loadError}</p>
        <button onClick={() => load()} className={buttonSecondary}><RefreshCw className="w-3.5 h-3.5" /> Try again</button>
      </div>
    );
  }
  if (!data) return <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center text-sm text-slate-500">Loading people…</div>;

  const disabled = busy !== null;
  const activeJob = live ?? (data.matchJob?.status === "RUNNING" ? data.matchJob : null);

  return (
    <div id="planning-center-people" className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5">
      <div>
        <h3 className="text-sm font-bold text-slate-900">People</h3>
        <p className="text-xs text-slate-500 mt-0.5">Link each WGC donor to the right person in Planning Center so their gifts land on their own giving record. WGC never links on a name alone.</p>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        {[
          ["Linked", data.counts.linked],
          ["To review", data.counts.needsReview],
          ["Not found", data.counts.noMatch],
        ].map(([label, n]) => (
          <div key={label as string} className="rounded-xl bg-slate-50 p-3">
            <div className="text-lg font-bold text-slate-900">{n}</div>
            <div className="text-xs text-slate-500">{label}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button className={buttonSecondary} disabled={disabled} onClick={() => runJob("MATCH_DONORS")}>
          {busy === "MATCH_DONORS" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5" />} Match my donors
        </button>
        <button
          className={buttonSecondary}
          disabled={disabled}
          onClick={() => {
            if (window.confirm("Import people from Planning Center as contacts?\n\nThis adds a WGC contact for each active adult who has an email or phone and isn't already a donor. Existing donors are never overwritten. It can't be undone in one click.")) runJob("IMPORT_PEOPLE");
          }}
        >
          {busy === "IMPORT_PEOPLE" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />} Import people as contacts
        </button>
      </div>

      {activeJob && <JobProgress job={activeJob} />}
      {!activeJob && data.matchJob?.status === "COMPLETED" && <JobProgress job={data.matchJob} />}
      {!activeJob && data.importJob?.status === "COMPLETED" && <JobProgress job={data.importJob} />}

      {data.review.length > 0 && (
        <section aria-labelledby="pco-people-review">
          <h4 id="pco-people-review" className="text-sm font-semibold text-slate-900 mb-1">Choose the right person ({data.counts.needsReview})</h4>
          <p className="text-xs text-slate-500 mb-2">More than one person in Planning Center could be this donor (for example a couple sharing an email).</p>
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-100">
            {data.review.map((item) => (
              <div key={item.donorId} className="p-3 text-xs">
                <div className="font-medium text-slate-900">{item.donorName ?? "Unnamed donor"}</div>
                <div className="text-slate-500 mb-2">{[item.donorEmail, item.donorPhone].filter(Boolean).join(" · ") || "No contact details"}</div>
                <div className="space-y-1.5">
                  {item.candidates.map((c) => (
                    <div key={c.pcoPersonId} className="flex flex-col gap-1.5 rounded-lg bg-slate-50 p-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900">{c.name}</div>
                        <div className="text-slate-500 break-words">{[...c.emails, ...c.phones].join(" · ") || "No contact details"}</div>
                        {c.alreadyLinkedDonorId && <div className="text-amber-700">Already linked to another WGC donor. If that&apos;s the same person, merge the two donors first.</div>}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {!c.alreadyLinkedDonorId && <button className={buttonSecondary} disabled={disabled} onClick={() => link(item.donorId, "LINK", c.pcoPersonId, "Linked.")}>This is them</button>}
                        <button className={buttonSecondary} disabled={disabled} onClick={() => link(item.donorId, "REJECT", c.pcoPersonId, "Got it, not offered again.")}>Not them</button>
                      </div>
                    </div>
                  ))}
                  {item.candidates.length === 0 && (
                    <button className={buttonSecondary} disabled={disabled} onClick={() => link(item.donorId, "RECHECK", undefined, "Checked again.")}>Look again</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
