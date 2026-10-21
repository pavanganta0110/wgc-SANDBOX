"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { describeSyncUnit, SYNC_STATUS_LABELS, type SendTiming, type SyncMode, type SyncOverview, type SyncTarget, type UnmatchedDonorPolicy } from "@/lib/integrations/planningcenter/syncTypes";
import type { ProfilePreview } from "@/lib/integrations/planningcenter/profilePreview";
import { useConfirm } from "@/components/common/ConfirmDialog";
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

const TARGETS: Array<{ value: SyncTarget; title: string; body: string; points: string[] }> = [
  {
    value: "GIFTS",
    title: "Send every gift to Planning Center",
    body: "Each gift is added to Planning Center Giving as soon as it's paid. Your giving history, reports and year-end statements stay in Planning Center.",
    points: [
      "Best if your team already works in Planning Center Giving.",
      "Planning Center charges a monthly Giving fee. It depends on how many gifts it records each month.",
    ],
  },
  {
    value: "PROFILE_FIELDS",
    title: "Send people only",
    body: "No gifts are added to Planning Center Giving. Instead, each person gets a \"WGC Giving\" box on their profile showing what they've given, with a link to the full details in WGC.",
    points: [
      "You don't pay Planning Center's monthly Giving fee, because no gifts are recorded there.",
      "Planning Center's own giving reports and \"has given\" lists won't include these gifts, so someone who just gave can look inactive there. Use the \"WGC Giving\" fields for those lists instead.",
    ],
  },
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
  const [confirm, confirmDialog] = useConfirm();

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
  const isPeople = settings.syncTarget === "PROFILE_FIELDS";
  const disabled = busy !== null;
  const modeBlocked = (mode: SyncMode): string | null => {
    if (mode === "OFF") return null;
    if (!data.platformEnabled) return "Not available yet";
    if (!data.ready) return isPeople ? "Reconnect Planning Center first" : "Finish Giving setup first";
    return null;
  };

  const changeMode = (mode: SyncMode) => {
    if (mode === settings.syncMode) return;
    putSettings({ syncMode: mode }, mode === "OFF" ? "Sync is off." : mode === "DRY_RUN" ? "Preview is on." : isPeople ? "People sync is on." : "Gift sync is on.");
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-6">
      {confirmDialog}
      <div>
        <h3 className="text-sm font-bold text-slate-900">{isPeople ? "People sync" : "Gift sync"}</h3>
        <p className="text-xs text-slate-500 mt-0.5">{isPeople ? "Your donors are matched to people in Planning Center, and their giving is shown on their profile. No donations are sent to Planning Center Giving." : "Every gift given through WGC is added to Planning Center Giving automatically, so your donors' giving stays in one place."}</p>
      </div>

      {!data.platformEnabled && (
        <div className="flex items-start gap-2 rounded-lg bg-slate-50 text-slate-600 text-xs p-3">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Gift sync isn&apos;t switched on for WGC yet. Your setup is saved, and you&apos;ll be able to turn it on here as soon as it is.</span>
        </div>
      )}
      {data.platformEnabled && !data.ready && (
        <div className="rounded-lg bg-amber-50 text-amber-800 text-xs p-3">
          <div className="font-semibold mb-1">{isPeople ? "Fix this to turn it on:" : "Finish Giving setup to turn this on:"}</div>
          <ul className="list-disc pl-5 space-y-0.5">{data.readinessReasons.map((r) => <li key={r}>{r}</li>)}</ul>
        </div>
      )}

      {/* What to send */}
      <section aria-labelledby="pco-sync-target">
        <h4 id="pco-sync-target" className="text-sm font-semibold text-slate-900 mb-2">What should WGC send to Planning Center?</h4>
        <SavingsNote activity={data.activity} />
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-labelledby="pco-sync-target">
          {TARGETS.map((t) => {
            const selected = settings.syncTarget === t.value;
            return (
              <button
                key={t.value}
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                onClick={async () => {
                  if (selected) return;
                  const ok = await confirm(
                    t.value === "PROFILE_FIELDS"
                      ? {
                          title: "Switch to people only?",
                          body: "WGC will stop sending donations to Planning Center and will fill a \"WGC Giving\" section on each matched person instead: what they have given, their last gift, and a link to their giving in WGC.\n\nGifts already sent stay where they are. Only people you have already matched are affected, and donors who asked to stay anonymous are never written.",
                          callout: {
                            title: "Check who can see it first",
                            body: "These amounts will show on people's Planning Center profiles to anyone your Planning Center settings allow to see that section, which may include staff who can't see your giving reports.",
                          },
                          confirmLabel: "Switch to people only",
                        }
                      : {
                          title: "Switch to sending every gift?",
                          body: "Only gifts paid from now on are sent. Gifts paid while you were on people only are not added to Planning Center Giving.",
                          confirmLabel: "Send every gift",
                        },
                  );
                  if (ok) putSettings({ syncTarget: t.value }, "Saved.");
                }}
                className={`text-left rounded-xl border p-3 transition disabled:opacity-60 ${selected ? "border-slate-900 bg-slate-50" : "border-slate-200 hover:border-slate-300"}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-900">{t.title}</span>
                  {selected && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                </div>
                <p className="text-xs text-slate-500 mt-1">{t.body}</p>
                <ul className="mt-2 space-y-1 text-xs text-slate-600 list-disc pl-4">{t.points.map((pt) => <li key={pt}>{pt}</li>)}</ul>
              </button>
            );
          })}
        </div>
      </section>

      {isPeople && <PeopleOnlyPanel data={data} disabled={disabled} />}

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
        {settings.syncMode === "LIVE" && settings.enabledAt && !isPeople && (
          <p className="text-xs text-slate-500 mt-2">On since {new Date(settings.enabledAt).toLocaleString()}. Only gifts paid after that are sent.</p>
        )}
      </section>

      {/* Settings */}
      <section aria-labelledby="pco-sync-settings" className="space-y-4">
        {!isPeople && (<>
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
        </>)}
      </section>

      {/* Actions */}
      {settings.syncMode !== "OFF" && data.platformEnabled && (
        <div className="flex flex-wrap gap-2">
          <button className={buttonPrimary} disabled={disabled} onClick={() => run("now", async () => {
            const r = await pcoFetch<{ processed: number; profilesUpdated?: number; stoppedForTime: boolean }>("/sync/run", { method: "POST", body: JSON.stringify({}) });
            if (isPeople) return settings.syncMode === "DRY_RUN" ? "Preview mode doesn't change Planning Center." : r.profilesUpdated ? `Updated ${r.profilesUpdated} ${r.profilesUpdated === 1 ? "person" : "people"}${r.stoppedForTime ? " (more to do, it will continue)" : ""}.` : "Everyone is up to date.";
            return r.processed === 0 ? "Nothing new to sync." : `Checked ${r.processed} deposit${r.processed === 1 ? "" : "s"}${r.stoppedForTime ? " (more to do, it will continue)" : ""}.`;
          })}>
            {busy === "now" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} {isPeople ? "Update people now" : settings.syncMode === "DRY_RUN" ? "Preview recent deposits" : "Sync now"}
          </button>
          {settings.syncMode === "DRY_RUN" && !isPeople && (
            <button className={buttonSecondary} disabled={disabled} onClick={() => run("recompute", async () => {
              await pcoFetch("/sync/run", { method: "POST", body: JSON.stringify({ recomputePreview: true }) });
              return "Preview refreshed.";
            })}>
              Refresh preview
            </button>
          )}
        </div>
      )}

      {!isPeople && (<>
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
                    <button className={buttonSecondary} disabled={disabled} onClick={async () => {
                      if (await confirm({ title: "Send this gift to Planning Center?", body: "Only choose this if you checked Planning Center and this gift is NOT in the batch. WGC will then send it.", confirmLabel: "Send it" })) run(`r-${item.donationId}`, async () => { await pcoFetch(`/sync/donations/${item.donationId}/resolve`, { method: "POST", body: JSON.stringify({ action: "RETRY" }) }); return "It will be sent."; });
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
      </>)}
    </div>
  );
}

/**
 * What processing cost on the church's own last 30 days, with Planning Center's published rates beside it. It states
 * both sides and makes no claim of a saving: whether WGC is cheaper depends on who covers the fee.
 */
function SavingsNote({ activity }: { activity: SyncOverview["activity"] }) {
  const hasGifts = activity.gifts > 0;
  const feesKnown = activity.wgcFeesPaidByChurchCents !== null && activity.wgcFeesCents !== null;
  const donorCovered = feesKnown ? Math.max((activity.wgcFeesCents as number) - (activity.wgcFeesPaidByChurchCents as number), 0) : 0;
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 mb-3 text-xs text-slate-700 space-y-2">
      <p>
        <strong>Payment fees.</strong> Gifts taken through WGC are processed by WGC, so Planning Center&apos;s payment fees don&apos;t apply to them. Both choices below work the same way for this.
      </p>
      {hasGifts ? (
        <div>
          <p className="mb-1">Your last {activity.days} days: <strong>{activity.gifts}</strong> {activity.gifts === 1 ? "gift" : "gifts"}, <strong>{money(activity.giftTotalCents)}</strong> given.</p>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5">
            <dt>Fees your church paid through WGC</dt>
            <dd className="text-right font-semibold">{feesKnown ? money(activity.wgcFeesPaidByChurchCents as number) : "Not available yet"}</dd>
            {feesKnown && donorCovered > 0 && (
              <>
                <dt className="text-slate-500">Fees your donors covered</dt>
                <dd className="text-right text-slate-500">{money(donorCovered)}</dd>
              </>
            )}
            <dt>About what Planning Center would have charged on the same gifts if your church paid the fees</dt>
            <dd className="text-right font-semibold">{money(activity.estimatedPlanningCenterFeeCents)}</dd>
          </dl>
          <p className="text-slate-500 mt-1">Planning Center&apos;s rates: 2.15% + $0.30 per card gift and $0.30 per bank gift. Planning Center also lets donors cover the fee, so your own result depends on who pays it.</p>
        </div>
      ) : (
        <p>Once gifts come in, this shows what processing cost your church next to Planning Center&apos;s published rates.</p>
      )}
      <p>
        Planning Center also charges a separate monthly Giving fee. It depends on how many gifts it records each month (the first 10 are free). <strong>Send people only</strong> records no gifts there. Check your price on{" "}
        <a href="https://www.planningcenter.com/pricing" target="_blank" rel="noreferrer" className="underline font-medium">Planning Center&apos;s pricing page</a>
        {hasGifts ? `, using about ${activity.gifts} gifts a month.` : "."}
      </p>
    </div>
  );
}

/** "People only": what's been written, and a preview of exactly how a profile will read in Planning Center. */
function PeopleOnlyPanel({ data, disabled }: { data: SyncOverview; disabled: boolean }) {
  const [preview, setPreview] = useState<ProfilePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchPreview = useCallback(
    () =>
      pcoFetch<ProfilePreview>("/sync/profile-preview")
        .then((next) => {
          setPreview(next);
          setError(null);
        })
        .catch((err) => setError(err instanceof Error ? err.message : "Could not load the preview."))
        .finally(() => setLoading(false)),
    []
  );
  useEffect(() => { fetchPreview(); }, [fetchPreview]);
  const loadPreview = () => {
    setLoading(true);
    fetchPreview();
  };

  const { profile } = data;
  return (
    <section aria-labelledby="pco-people-only" className="rounded-xl border border-slate-200 p-4 space-y-3">
      <div>
        <h4 id="pco-people-only" className="text-sm font-semibold text-slate-900">What your team will see in Planning Center</h4>
        <p className="text-xs text-slate-500 mt-0.5">A &quot;{preview?.sectionName ?? "WGC Giving"}&quot; section on each matched person, updated when they give. It shows totals, not individual gifts: open the link on the profile for the full detail in WGC.</p>
        <p className="text-xs text-amber-800 bg-amber-50 rounded-lg p-2 mt-2">
          <strong>Who can see this.</strong> These amounts appear on people&apos;s Planning Center profiles to anyone your Planning Center settings allow to see that section, which may include staff who can&apos;t see your giving reports. Check those settings in Planning Center. Donors who asked to stay anonymous are never written.
        </p>
      </div>

      {data.settings.syncMode === "LIVE" && (
        <p className="text-xs text-slate-600">
          {profile.updatedPeople} of {profile.linkedPeople} matched {profile.linkedPeople === 1 ? "person has" : "people have"} the section{profile.lastUpdatedAt ? `. Last updated ${new Date(profile.lastUpdatedAt).toLocaleString()}` : ""}.
        </p>
      )}

      {loading && !preview && <p className="text-xs text-slate-500">Loading the preview…</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {preview && (
        <>
          <p className="text-xs text-slate-600">
            <strong>{preview.counts.matched}</strong> {preview.counts.matched === 1 ? "donor who has given is" : "donors who have given are"} matched and would get the section.
            {preview.counts.notMatched > 0 && <> <strong>{preview.counts.notMatched}</strong> aren&apos;t matched yet: nothing is written for them and no person is created. Use &quot;Match my donors&quot; in the People section below to match them.</>}
            {preview.counts.anonymous > 0 && <> {preview.counts.anonymous} asked to stay anonymous and never appear.</>}
          </p>
          {preview.samples.length === 0 ? (
            <p className="text-xs text-slate-500">No gifts to show yet. Once donors give and are matched, you&apos;ll see exactly how their profiles will read.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {preview.samples.map((sample, i) => (
                <div key={i} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-semibold text-slate-900">{sample.matchedPersonName ?? sample.donorName}</div>
                  {!sample.matchedPersonName && <div className="text-[11px] text-amber-700 mb-1">Not matched yet. Shown as it would look once they are.</div>}
                  <div className="text-[11px] uppercase tracking-wide text-slate-400 mt-2 mb-1">{preview.sectionName}</div>
                  <dl className="space-y-0.5">
                    {sample.rows.map((row) => (
                      <div key={row.label} className="flex justify-between gap-3 text-xs">
                        <dt className="text-slate-500">{row.label}</dt>
                        <dd className="text-slate-900 text-right">{row.value}</dd>
                      </div>
                    ))}
                    <div className="flex justify-between gap-3 text-xs">
                      <dt className="text-slate-500">Giving details</dt>
                      <dd className="text-blue-700 text-right">Opens in WGC</dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
          )}
          <button type="button" className={buttonSecondary} disabled={disabled || loading} onClick={loadPreview}>
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Refresh preview
          </button>
        </>
      )}
    </section>
  );
}
