"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Sparkles } from "lucide-react";
import type { GivingSetupState, MappingHealth } from "@/lib/integrations/planningcenter/givingTypes";

const API = "/api/merchant/settings/integrations/planning-center/giving";

class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  let body: { error?: string } | null = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) throw new ApiError(body?.error || "Something went wrong. Please try again.", res.status);
  return body as T;
}

const selectClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:opacity-50 disabled:bg-slate-50";
const secondaryButton =
  "px-3.5 py-2 rounded-lg font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-xs flex items-center gap-1.5 whitespace-nowrap";

function HealthNote({ health }: { health: MappingHealth }) {
  if (health === "OK") return null;
  return (
    <p className="mt-1 text-xs text-red-600">
      {health === "MISSING" ? "This fund no longer exists in Planning Center." : "This fund can't receive gifts in Planning Center."} Choose another.
    </p>
  );
}

export default function PlanningCenterGivingSetup() {
  const [state, setState] = useState<GivingSetupState | null>(null);
  const [hidden, setHidden] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    return api<GivingSetupState>("")
      .then((next) => {
        setState(next);
        setLoadError(null);
        setHidden(false);
      })
      .catch((err) => {
        // Not available here, or not connected yet: this panel simply isn't shown.
        if (err instanceof ApiError && (err.status === 404 || err.status === 409)) {
          setHidden(true);
          setState(null);
          return;
        }
        setLoadError(err instanceof Error ? err.message : "Could not load Giving setup.");
      });
  }, []);

  useEffect(() => {
    load();
    // The connection card tells us when connecting, testing or disconnecting changed things.
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

  if (hidden) return null;

  if (loadError && !state) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h3 className="text-sm font-bold text-slate-900 mb-2">Giving setup</h3>
        <p className="text-xs text-red-600 mb-3">{loadError}</p>
        <button onClick={() => load()} className={secondaryButton}>
          <RefreshCw className="w-3.5 h-3.5" /> Try again
        </button>
      </div>
    );
  }

  if (!state) {
    return <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center text-sm text-slate-500">Loading Giving setup…</div>;
  }

  // Giving unreachable: explain exactly what to fix instead of showing steps that can't work.
  if (state.pcoAccess !== "OK") {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h3 className="text-sm font-bold text-slate-900 mb-3">Giving setup</h3>
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 text-amber-800 text-xs p-3 mb-4">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            {state.pcoAccess === "DENIED"
              ? "The Planning Center user who connected can't access Giving. Disconnect and reconnect using a Finance Administrator account."
              : "Giving doesn't appear to be turned on for this Planning Center organization. Enable Giving in Planning Center, then check again."}
          </span>
        </div>
        <button onClick={() => run("recheck", async () => {})} disabled={busy !== null} className={secondaryButton}>
          {busy === "recheck" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Check again
        </button>
      </div>
    );
  }

  const usableFunds = state.pcoFunds.filter((f) => f.usable);
  const unmappedWithSuggestion = state.funds.filter((f) => !f.mapping && f.suggestion);
  const sourceReady = state.paymentSource.state === "READY" && state.canWriteGiving === true;
  const disabled = busy !== null;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Giving setup</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Get ready to record WGC gifts in {state.organizationName ? `${state.organizationName}'s` : "your"} Planning Center Giving. Nothing is sent yet.
          </p>
        </div>
        <button onClick={() => run("refresh", async () => {})} disabled={disabled} className={secondaryButton} aria-label="Refresh from Planning Center">
          {busy === "refresh" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Refresh
        </button>
      </div>

      {/* Readiness */}
      {state.readiness.ready ? (
        <div className="flex items-start gap-2 rounded-lg bg-green-50 text-green-800 text-xs p-3">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">Giving setup is complete.</div>
            {state.readiness.notes.map((n) => (
              <div key={n} className="mt-0.5">{n}</div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-lg bg-amber-50 text-amber-800 text-xs p-3">
          <div className="flex items-center gap-2 font-semibold mb-1">
            <AlertTriangle className="w-4 h-4 shrink-0" /> Still to do
          </div>
          <ul className="list-disc pl-6 space-y-0.5">
            {state.readiness.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          {state.readiness.notes.map((n) => (
            <div key={n} className="mt-1.5 text-amber-700">{n}</div>
          ))}
        </div>
      )}

      {/* Step 1 — payment source */}
      <section aria-labelledby="pco-step-source">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <h4 id="pco-step-source" className="text-sm font-semibold text-slate-900">1. Payment source</h4>
            <p className="text-xs text-slate-500 mt-0.5 max-w-xl">
              WGC gifts are recorded under a payment source called “{state.paymentSource.name}”, so you can tell them apart from other giving in Planning Center.
              Setting it up also confirms your Planning Center user can make changes in Giving.
            </p>
            {state.paymentSource.state === "MISSING" && state.paymentSource.existingWillBeReused && (
              <p className="text-xs text-slate-500 mt-1">A source with this name already exists in Planning Center and will be reused.</p>
            )}
            {state.paymentSource.state === "ARCHIVED" && (
              <p className="text-xs text-amber-700 mt-1">It&apos;s archived in Planning Center. Setting it up again will reactivate it.</p>
            )}
            {state.canWriteGiving === false && (
              <p className="text-xs text-red-600 mt-1">Planning Center refused the change. Reconnect with a Finance Administrator account.</p>
            )}
          </div>
          <div className="flex items-center gap-3 sm:shrink-0">
            {sourceReady && (
              <span className="flex items-center gap-1 text-xs font-semibold text-green-700">
                <CheckCircle2 className="w-4 h-4" /> Ready
              </span>
            )}
            <button
              onClick={() => run("source", async () => {
                const r = await api<{ paymentSource: { reused: boolean } }>("/payment-source", { method: "POST" });
                return r.paymentSource.reused ? "Payment source verified." : "Payment source created.";
              })}
              disabled={disabled}
              className={secondaryButton}
            >
              {busy === "source" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              {sourceReady ? "Re-check" : "Set up payment source"}
            </button>
          </div>
        </div>
      </section>

      {/* Step 2 — default fund */}
      <section aria-labelledby="pco-step-default">
        <h4 id="pco-step-default" className="text-sm font-semibold text-slate-900">2. Default fund</h4>
        <p className="text-xs text-slate-500 mt-0.5 mb-2 max-w-xl">
          Gifts that aren&apos;t mapped to a specific fund below, or that were given without choosing one, are recorded in this fund.
        </p>
        <div className="max-w-sm">
          <select
            aria-label="Default Planning Center fund"
            className={selectClass}
            disabled={disabled || usableFunds.length === 0}
            value={state.defaultFund?.pcoFundId ?? ""}
            onChange={(e) =>
              run("default", async () => {
                await api("/default-fund", { method: "PUT", body: JSON.stringify({ pcoFundId: e.target.value || null }) });
                return "Default fund saved.";
              })
            }
          >
            <option value="">Choose a fund…</option>
            {state.defaultFund && !usableFunds.some((f) => f.id === state.defaultFund!.pcoFundId) && (
              <option value={state.defaultFund.pcoFundId}>{state.defaultFund.pcoFundName || "Unavailable fund"} (unavailable)</option>
            )}
            {usableFunds.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
                {f.isDefault ? " (Planning Center default)" : ""}
              </option>
            ))}
          </select>
          {state.defaultFund && <HealthNote health={state.defaultFund.health} />}
          {!state.defaultFund && state.suggestedDefaultFund && (
            <button
              className="mt-2 text-xs text-blue-600 hover:underline disabled:opacity-50"
              disabled={disabled}
              onClick={() =>
                run("default", async () => {
                  await api("/default-fund", { method: "PUT", body: JSON.stringify({ pcoFundId: state.suggestedDefaultFund!.pcoFundId }) });
                  return "Default fund saved.";
                })
              }
            >
              Use “{state.suggestedDefaultFund.pcoFundName}” (Planning Center&apos;s default)
            </button>
          )}
        </div>
      </section>

      {/* Step 3 — fund mapping */}
      <section aria-labelledby="pco-step-funds">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4 mb-2">
          <div>
            <h4 id="pco-step-funds" className="text-sm font-semibold text-slate-900">3. Match your funds</h4>
            <p className="text-xs text-slate-500 mt-0.5 max-w-xl">
              Choose which Planning Center fund each WGC fund goes to. You can pick an existing fund or create a new one there.
            </p>
          </div>
          {unmappedWithSuggestion.length > 0 && (
            <button
              disabled={disabled}
              className={secondaryButton}
              onClick={() =>
                run("auto", async () => {
                  const r = await api<{ mapped: number }>("/fund-mappings/auto-match", { method: "POST" });
                  return r.mapped === 1 ? "Matched 1 fund by name." : `Matched ${r.mapped} funds by name.`;
                })
              }
            >
              {busy === "auto" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Match {unmappedWithSuggestion.length} by name
            </button>
          )}
        </div>

        {state.funds.length === 0 ? (
          <p className="text-xs text-slate-500 rounded-lg bg-slate-50 p-3">
            You don&apos;t have any active funds in WGC yet, so every gift will go to your default fund.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-100">
            {state.funds.map((fund) => (
              <div key={fund.fundId} className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_11rem] sm:items-start">
                <div className="text-sm font-medium text-slate-900 break-words pt-2">{fund.name}</div>
                <div>
                  <select
                    aria-label={`Planning Center fund for ${fund.name}`}
                    className={selectClass}
                    disabled={disabled}
                    value={fund.mapping?.pcoFundId ?? ""}
                    onChange={(e) =>
                      run(`map-${fund.fundId}`, async () => {
                        await api("/fund-mappings", { method: "PUT", body: JSON.stringify({ fundId: fund.fundId, pcoFundId: e.target.value || null }) });
                        return e.target.value ? "Fund matched." : "Fund unmatched.";
                      })
                    }
                  >
                    <option value="">{fund.mapping ? "Remove match" : state.defaultFund ? "Uses default fund" : "Not matched yet"}</option>
                    {fund.mapping && !usableFunds.some((f) => f.id === fund.mapping!.pcoFundId) && (
                      <option value={fund.mapping.pcoFundId}>{fund.mapping.pcoFundName || "Unavailable fund"} (unavailable)</option>
                    )}
                    {usableFunds.map((f) => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                  {fund.mapping && <HealthNote health={fund.mapping.health} />}
                  {!fund.mapping && fund.suggestion && (
                    <button
                      className="mt-1 text-xs text-blue-600 hover:underline disabled:opacity-50"
                      disabled={disabled}
                      onClick={() =>
                        run(`map-${fund.fundId}`, async () => {
                          await api("/fund-mappings", { method: "PUT", body: JSON.stringify({ fundId: fund.fundId, pcoFundId: fund.suggestion!.pcoFundId }) });
                          return "Fund matched.";
                        })
                      }
                    >
                      Match to “{fund.suggestion.pcoFundName}”
                    </button>
                  )}
                </div>
                <div className="sm:pt-0.5">
                  {!fund.mapping && !fund.suggestion && (
                    <button
                      disabled={disabled}
                      className={secondaryButton}
                      onClick={() =>
                        run(`create-${fund.fundId}`, async () => {
                          await api("/fund-mappings/create", { method: "POST", body: JSON.stringify({ fundId: fund.fundId }) });
                          return `Created “${fund.name}” in Planning Center.`;
                        })
                      }
                    >
                      {busy === `create-${fund.fundId}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                      Create in Planning Center
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-slate-400 mt-2">New funds created here are hidden from your Church Center donation form, so donors don&apos;t see them unless you choose to show them in Planning Center.</p>
      </section>
    </div>
  );
}
