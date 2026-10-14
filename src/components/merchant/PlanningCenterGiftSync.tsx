"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { describeSyncUnit, SYNC_STATUS_LABELS, type SendTiming, type SyncMode, type SyncOverview, type UnmatchedDonorPolicy } from "@/lib/integrations/planningcenter/syncTypes";
import { buttonDanger, buttonPrimary, buttonSecondary, money, PcoApiError, pcoFetch } from "./planningCenterApi";

const TONE: Record<string, string> = {
  ok: "bg-green-50 text-green-700",
  info: "bg-blue-50 text-blue-700",
  warn: "bg-amber-50 text-amber-700",
  bad: "bg-red-50 text-red-700",
  muted: "bg-slate-100 text-slate-500",
};

function StatusBadge({ status }: { status: string }) {
  const s = SYNC_STATUS_LABELS[status] ?? { label: status, tone: "muted" as const };
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${TONE[s.tone]}`}>{s.label}</span>;
}

const MODES: Array<{ mode: SyncMode; title: string; body: string }> = [
  { mode: "LIVE", title: "On", body: "Each gift is added to Planning Center after it's paid. Gifts from before you turned it on are never sent." },
  { mode: "OFF", title: "Off", body: "Nothing is sent to Planning Center." },
  { mode: "DRY_RUN", title: "Preview only", body: "WGC works out what it would send and shows you. Nothing is sent." },
];

const TIMINGS: Array<{ value: SendTiming; label: string; hint: string }> = [
  { value: "ON_PAYMENT", label: "As soon as it's paid (recommended)", hint: "Gifts appear in Planning Center within minutes, in one batch per day. If a gift is later refunded or returned, WGC updates it there too." },
  { value: "ON_SETTLEMENT", label: "After the bank deposit arrives", hint: "One batch per bank deposit, sent once the deposit settles. Slower, but a gift is never sent before the money is final." },
];

const POLICIES: Array<{ value: UnmatchedDonorPolicy; label: string; hint: string }> = [
  { value: "ATTACH_LATER", label: "Send the gift now and attach the person once they're matched (recommended)", hint: "The gift is never held back, and no duplicate person is created. It goes in without a name and is given one as soon as the donor is matched." },
  { value: "HOLD_FOR_REVIEW", label: "Hold the gift until I choose the person", hint: "Everything else is sent. Held gifts are sent as soon as the donor is linked." },
  { value: "ANONYMOUS", label: "Send it as an anonymous gift", hint: "It won't appear on the donor's Planning Center giving statement." },
  { value: "CREATE_PERSON", label: "Create the person in Planning Center (experimental)", hint: "Adds a new person to your Planning Center directory. Only used when nobody could match." },
];

export default function PlanningCenterGiftSync() {
  const [data, setData] = useState<SyncOverview | null>(null);
  const [hidden, setHidden] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showSkipped, setShowSkipped] = useState(false);

  const load = useCallback(() => {
    return pcoFetch<SyncOverview>("/sync")
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
        setLoadError(err instanceof Error ? err.message : "Could not load gift sync.");
      });
  }, []);

  useEffect(() => {
    load();
    const onChange = () => load();
    window.addEventListener("pco-connection-changed", onChange);
    return () => window.removeEventListener("pco-connection-changed", onChange);
  }, [load]);

  const run = async (key: string, work: () => Promise<string | void>) => {
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

  const putSettings = (body: object, success: string) => run("settings", async () => {
    await pcoFetch("/sync/settings", { method: "PUT", body: JSON.stringify(body) });
    return success;
  });

  if (hidden) return null;
  if (loadError && !data) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h3 className="text-sm font-bold text-slate-900 mb-2">Gift sync</h3>
        <p className="text-xs text-red-600 mb-3">{loadError}</p>
        <button onClick={() => load()} className={buttonSecondary}><RefreshCw className="w-3.5 h-3.5" /> Try again</button>
      </div>
    );
  }
  if (!data) return <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center text-sm text-slate-500">Loading gift sync…</div>;

  const { settings } = data;
  const disabled = busy !== null;
  const modeBlocked = (mode: SyncMode): string | null => {
    if (mode === "OFF") return null;
    if (!data.platformEnabled) return "Not available yet";
    if (!data.ready) return "Finish Giving setup first";
    return null;
  };

  const changeMode = (mode: SyncMode) => {
    if (mode === settings.syncMode) return;
    putSettings({ syncMode: mode }, mode === "OFF" ? "Gift sync is off." : mode === "DRY_RUN" ? "Preview is on." : "Gift sync is on.");
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-6">
      <div>
        <h3 className="text-sm font-bold text-slate-900">Gift sync</h3>
        <p className="text-xs text-slate-500 mt-0.5">Every gift given through WGC is added to Planning Center Giving automatically, so your donors&apos; giving stays in one place.</p>
      </div>

      {!data.platformEnabled && (
        <div className="flex items-start gap-2 rounded-lg bg-slate-50 text-slate-600 text-xs p-3">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Gift sync isn&apos;t switched on for WGC yet. Your setup is saved, and you&apos;ll be able to turn it on here as soon as it is.</span>
        </div>
      )}
      {data.platformEnabled && !data.ready && (
        <div className="rounded-lg bg-amber-50 text-amber-800 text-xs p-3">
          <div className="font-semibold mb-1">Finish Giving setup to turn this on:</div>
          <ul className="list-disc pl-5 space-y-0.5">{data.readinessReasons.map((r) => <li key={r}>{r}</li>)}</ul>
        </div>
      )}

      {/* Mode */}
      <section aria-labelledby="pco-sync-mode">
        <h4 id="pco-sync-mode" className="text-sm font-semibold text-slate-900 mb-2">Mode</h4>
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-labelledby="pco-sync-mode">
          {MODES.map((m) => {
            const blocked = modeBlocked(m.mode);
            const selected = settings.syncMode === m.mode;
            return (
              <button
                key={m.mode}
                role="radio"
                aria-checked={selected}
                disabled={disabled || (blocked !== null && !selected)}
                onClick={() => changeMode(m.mode)}
                className={`text-left rounded-xl border p-3 transition disabled:opacity-60 ${selected ? "border-slate-900 bg-slate-50" : "border-slate-200 hover:border-slate-300"}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-900">{m.title}</span>
                  {selected && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                </div>
                <p className="text-xs text-slate-500 mt-1">{m.body}</p>
                {blocked && !selected && <p className="text-xs text-amber-700 mt-1.5 font-medium">{blocked}</p>}
              </button>
            );
          })}
        </div>
        {settings.syncMode === "LIVE" && settings.enabledAt && (
          <p className="text-xs text-slate-500 mt-2">On since {new Date(settings.enabledAt).toLocaleString()}. Only gifts paid after that are sent.</p>
        )}
      </section>

      {/* Settings */}
      <section aria-labelledby="pco-sync-settings" className="space-y-4">
        <div>
          <h4 className="text-sm font-semibold text-slate-900 mb-1">When gifts are sent</h4>
          <div className="space-y-1.5">
            {TIMINGS.map((t) => (
              <label key={t.value} className="flex items-start gap-2 text-xs cursor-pointer">
                <input type="radio" name="pco-timing" className="mt-0.5" disabled={disabled} checked={settings.sendTiming === t.value} onChange={() => putSettings({ sendTiming: t.value }, "Saved.")} />
                <span><span className="font-medium text-slate-900">{t.label}</span><span className="block text-slate-500">{t.hint}</span></span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <h4 id="pco-sync-settings" className="text-sm font-semibold text-slate-900 mb-1">If a donor can&apos;t be matched to a person in Planning Center</h4>
          <div className="space-y-1.5">
            {POLICIES.map((p) => (
              <label key={p.value} className="flex items-start gap-2 text-xs cursor-pointer">
                <input type="radio" name="pco-policy" className="mt-0.5" disabled={disabled} checked={settings.unmatchedDonorPolicy === p.value} onChange={() => putSettings({ unmatchedDonorPolicy: p.value }, "Saved.")} />
                <span><span className="font-medium text-slate-900">{p.label}</span><span className="block text-slate-500">{p.hint}</span></span>
              </label>
            ))}
          </div>
        </div>
        <label className="flex items-start gap-2 text-xs cursor-pointer">
          <input type="checkbox" className="mt-0.5" disabled={disabled} checked={settings.autoCommitBatches} onChange={(e) => putSettings({ autoCommitBatches: e.target.checked }, "Saved.")} />
          <span>
            <span className="font-medium text-slate-900">Commit each batch automatically</span>
            <span className="block text-slate-500">Off by default: batches wait in Planning Center for your finance team to review and commit. Until a batch is committed, its gifts aren&apos;t in donors&apos; giving history or statements.</span>
          </span>
        </label>
      </section>

      {/* Actions */}
      {settings.syncMode !== "OFF" && data.platformEnabled && (
        <div className="flex flex-wrap gap-2">
          <button className={buttonPrimary} disabled={disabled} onClick={() => run("now", async () => {
            const r = await pcoFetch<{ processed: number; stoppedForTime: boolean }>("/sync/run", { method: "POST", body: JSON.stringify({}) });
            return r.processed === 0 ? "Nothing new to sync." : `Checked ${r.processed} deposit${r.processed === 1 ? "" : "s"}${r.stoppedForTime ? " (more to do, it will continue)" : ""}.`;
          })}>
            {busy === "now" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} {settings.syncMode === "DRY_RUN" ? "Preview recent deposits" : "Sync now"}
          </button>
          {settings.syncMode === "DRY_RUN" && (
            <button className={buttonSecondary} disabled={disabled} onClick={() => run("recompute", async () => {
              await pcoFetch("/sync/run", { method: "POST", body: JSON.stringify({ recomputePreview: true }) });
              return "Preview refreshed.";
            })}>
              Refresh preview
            </button>
          )}
        </div>
      )}

      {/* Needs your review */}
      {data.needsReview.length > 0 && (
        <section aria-labelledby="pco-sync-review">
          <h4 id="pco-sync-review" className="text-sm font-semibold text-red-700 mb-1">Needs your review ({data.needsReview.length})</h4>
          <p className="text-xs text-slate-500 mb-2">WGC couldn&apos;t confirm what happened with these gifts, so it set them aside. Open the batch in Planning Center Giving and look for them before choosing.</p>
          <div className="divide-y divide-slate-100 rounded-xl border border-red-100">
            {data.needsReview.map((item) => (
              <div key={item.donationId} className="p-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="text-xs min-w-0">
                  <div className="font-medium text-slate-900">{money(item.amountCents)} · {item.receivedOn} · {describeSyncUnit(item.settlementId)}</div>
                  <div className="text-slate-600 mt-0.5">{item.message}</div>
                </div>
                {item.status === "NEEDS_REVIEW" && item.code === "REVERSAL_NOT_APPLIED" && (
                  // Already in Planning Center and refunded/returned in WGC: it can never be "sent" again.
                  <div className="flex gap-2 shrink-0">
                    <button className={buttonSecondary} disabled={disabled} onClick={() => run(`r-${item.donationId}`, async () => { await pcoFetch(`/sync/donations/${item.donationId}/resolve`, { method: "POST", body: JSON.stringify({ action: "RETRY" }) }); return "WGC will check again."; })}>Check again</button>
                    <button className={buttonSecondary} disabled={disabled} onClick={() => run(`s-${item.donationId}`, async () => { await pcoFetch(`/sync/donations/${item.donationId}/resolve`, { method: "POST", body: JSON.stringify({ action: "SKIP" }) }); return "Marked as handled."; })}>I handled it in Planning Center</button>
                  </div>
                )}
                {item.status === "NEEDS_REVIEW" && item.code !== "REVERSAL_NOT_APPLIED" && (
                  <div className="flex gap-2 shrink-0">
                    <button className={buttonSecondary} disabled={disabled} onClick={() => {
                      if (window.confirm("Only choose this if you checked Planning Center and this gift is NOT in the batch. WGC will then send it.")) run(`r-${item.donationId}`, async () => { await pcoFetch(`/sync/donations/${item.donationId}/resolve`, { method: "POST", body: JSON.stringify({ action: "RETRY" }) }); return "It will be sent."; });
                    }}>It&apos;s not there — send it</button>
                    <button className={buttonDanger} disabled={disabled} onClick={() => run(`s-${item.donationId}`, async () => { await pcoFetch(`/sync/donations/${item.donationId}/resolve`, { method: "POST", body: JSON.stringify({ action: "SKIP" }) }); return "Skipped."; })}>Don&apos;t send</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Changed after sending */}
      {data.needsAttention.length > 0 && (
        <section aria-labelledby="pco-sync-attention">
          <h4 id="pco-sync-attention" className="text-sm font-semibold text-amber-700 mb-1">Changed after it was sent ({data.needsAttention.length})</h4>
          <p className="text-xs text-slate-500 mb-2">WGC doesn&apos;t change gifts already in Planning Center. Update these there so your records match.</p>
          <div className="divide-y divide-slate-100 rounded-xl border border-amber-100">
            {data.needsAttention.map((item) => (
              <div key={item.paymentId} className="p-3 text-xs">
                <div className="font-medium text-slate-900">{money(item.amountCents)} · {item.receivedOn}</div>
                <div className="text-slate-600 mt-0.5">{item.message}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Held */}
      {data.held.total > 0 && (
        <section aria-labelledby="pco-sync-held">
          <h4 id="pco-sync-held" className="text-sm font-semibold text-slate-900 mb-1">Waiting for a donor match ({data.held.total})</h4>
          <p className="text-xs text-slate-500 mb-2">Choose the right person under &ldquo;People&rdquo; above and these are sent automatically.</p>
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-100">
            {data.held.items.map((item) => (
              <div key={item.donationId} className="p-3 text-xs flex flex-col gap-1 sm:flex-row sm:justify-between">
                <div><span className="font-medium text-slate-900">{item.donorName ?? "Unknown donor"}</span> · {money(item.amountCents)} · {item.receivedOn}</div>
                <div className="text-slate-500">{item.message}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Deposits */}
      <section aria-labelledby="pco-sync-deposits">
        <h4 id="pco-sync-deposits" className="text-sm font-semibold text-slate-900 mb-2">Recent batches</h4>
        {data.records.length === 0 ? (
          <p className="text-xs text-slate-500 rounded-lg bg-slate-50 p-3">Nothing yet. Once gift sync is on, each day&apos;s gifts appear here as they&apos;re sent.</p>
        ) : (
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-100">
            {data.records.map((r) => (
              <div key={r.id} className="p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-slate-900 break-words">{describeSyncUnit(r.settlementId)}</span>
                    <StatusBadge status={r.status} />
                    {r.commitStatus === "COMMITTED" && <span className="text-[11px] text-green-700 font-semibold">Committed</span>}
                  </div>
                  <div className="text-slate-500 mt-0.5">
                    {r.counts.created} sent{r.counts.held ? ` · ${r.counts.held} held` : ""}{r.counts.skipped ? ` · ${r.counts.skipped} skipped` : ""}{r.counts.pending ? ` · ${r.counts.pending} waiting` : ""}
                    {r.status === "DRY_RUN" ? ` · ${r.counts.created + r.counts.pending + r.counts.held} would be sent` : ""}
                  </div>
                  {(r.blockedReason || (["FAILED", "RETRY_SCHEDULED", "NEEDS_REVIEW"].includes(r.status) && r.lastErrorMessage)) && (
                    <div className="text-slate-600 mt-0.5">{r.blockedReason ?? r.lastErrorMessage}</div>
                  )}
                </div>
                {["FAILED", "BLOCKED", "RETRY_SCHEDULED"].includes(r.status) && (
                  <button className={buttonSecondary} disabled={disabled} onClick={() => run(`retry-${r.id}`, async () => { await pcoFetch(`/sync/records/${r.id}/retry`, { method: "POST" }); return "Retrying."; })}>Retry</button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {data.skipped.total > 0 && (
        <section>
          <button className="text-xs text-blue-600 hover:underline" onClick={() => setShowSkipped((v) => !v)}>
            {showSkipped ? "Hide" : "Show"} {data.skipped.total} gift{data.skipped.total === 1 ? "" : "s"} that WGC didn&apos;t send
          </button>
          {showSkipped && (
            <div className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-100">
              {data.skipped.items.map((item) => (
                <div key={item.paymentId} className="p-3 text-xs">
                  <div className="font-medium text-slate-900">{money(item.amountCents)} · {item.receivedOn}</div>
                  <div className="text-slate-500 mt-0.5">{item.message}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
