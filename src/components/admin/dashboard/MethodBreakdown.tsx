"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Card, { EmptyNote } from "@/components/merchant/reporting/overview/Card";
import { SERIES } from "@/components/merchant/reporting/overview/tokens";
import { formatCents, percent } from "@/components/merchant/reporting/overview/format";

export interface BreakdownRow {
  key: string;
  label: string;
  hint: string;
  amountCents: number;
  count: number;
}

type View = "methods" | "card";

const COLOR: Record<string, string> = {
  CARD: SERIES.indigo,
  ACH: SERIES.teal,
  OTHER: SERIES.other,
  CREDIT: SERIES.indigo,
  DEBIT: "#0284C7",
  PREPAID: SERIES.amber,
  UNKNOWN: SERIES.other,
};

function Bar({ rows, total }: { rows: BreakdownRow[]; total: number }) {
  return (
    <div
      className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-slate-100"
      role="img"
      aria-label={rows.map((r) => `${r.label} ${percent((r.amountCents / total) * 100)}`).join(", ")}
    >
      {rows
        .filter((r) => r.amountCents > 0)
        .map((r) => (
          <div
            key={r.key}
            style={{ width: `${(r.amountCents / total) * 100}%`, background: COLOR[r.key] }}
            className="transition-[width] duration-300 first:rounded-l-full last:rounded-r-full motion-reduce:transition-none"
          />
        ))}
    </div>
  );
}

function Rows({ rows, total, drillKey, onDrill }: { rows: BreakdownRow[]; total: number; drillKey?: string; onDrill?: () => void }) {
  return (
    <ul className="mt-4 space-y-1">
      {rows.map((r) => {
        const share = total > 0 ? (r.amountCents / total) * 100 : 0;
        const drillable = r.key === drillKey && r.amountCents > 0;
        const inner = (
          <>
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: COLOR[r.key] }} aria-hidden />
            <span className="min-w-0 text-left">
              <span className="block font-medium text-slate-700">{r.label}</span>
              <span className="block text-xs text-slate-500">
                {r.count.toLocaleString("en-US")} payment{r.count === 1 ? "" : "s"} · {r.hint}
              </span>
            </span>
            <span className="ml-auto font-bold tabular-nums text-slate-900">{formatCents(r.amountCents)}</span>
            <span className="w-10 text-right text-xs tabular-nums text-slate-500">{percent(share)}</span>
            {drillable && <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-indigo-600" aria-hidden />}
          </>
        );
        return (
          <li key={r.key}>
            {drillable ? (
              <button
                type="button"
                onClick={onDrill}
                aria-label={`${r.label}: show credit vs debit`}
                className="group flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-sm outline-none transition hover:bg-indigo-50/60 focus-visible:ring-2 focus-visible:ring-indigo-500 motion-reduce:transition-none"
              >
                {inner}
              </button>
            ) : (
              <div className={`flex w-full items-center gap-2.5 px-2 py-2 text-sm ${r.amountCents === 0 ? "opacity-60" : ""}`}>{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default function MethodBreakdown({
  methods,
  cardTypes,
  periodLabel,
}: {
  methods: BreakdownRow[];
  cardTypes: BreakdownRow[];
  periodLabel: string;
}) {
  const [view, setView] = useState<View>("methods");
  const methodTotal = methods.reduce((s, r) => s + r.amountCents, 0);
  const cardTotal = cardTypes.reduce((s, r) => s + r.amountCents, 0);
  const visibleMethods = methods.filter((r) => r.key !== "OTHER" || r.amountCents > 0);
  const visibleCardTypes = cardTypes.filter((r) => (r.key !== "PREPAID" && r.key !== "UNKNOWN") || r.amountCents > 0);
  const credit = cardTypes.find((r) => r.key === "CREDIT")?.amountCents ?? 0;
  const debit = cardTypes.find((r) => r.key === "DEBIT")?.amountCents ?? 0;

  const tabs: [View, string][] = [
    ["methods", "Card vs ACH"],
    ["card", "Credit vs debit"],
  ];

  return (
    <Card
      title={view === "methods" ? "Payment methods" : "Card payments by card type"}
      subtitle={view === "methods" ? `${periodLabel} · select Card for credit vs debit` : `${periodLabel} · ${formatCents(cardTotal)} on cards`}
      action={
        <div role="radiogroup" aria-label="Breakdown" className="flex shrink-0 rounded-lg bg-slate-100 p-0.5">
          {tabs.map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={view === k}
              onClick={() => setView(k)}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold outline-none transition motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                view === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      }
    >
      {view === "methods" ? (
        methodTotal === 0 ? (
          <EmptyNote title="Nothing processed in this period" body="Card and ACH volume across every merchant will be split out here." />
        ) : (
          <>
            <Bar rows={visibleMethods} total={methodTotal} />
            <Rows rows={visibleMethods} total={methodTotal} drillKey="CARD" onDrill={() => setView("card")} />
          </>
        )
      ) : (
        <>
          <button
            type="button"
            onClick={() => setView("methods")}
            className="-mt-1 mb-3 inline-flex items-center gap-1 rounded text-xs font-semibold text-indigo-600 outline-none hover:text-indigo-800 focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
            All payment methods
          </button>
          {cardTotal === 0 ? (
            <EmptyNote title="No card payments in this period" body="Credit, debit and prepaid card volume will show here." />
          ) : (
            <>
              <Bar rows={visibleCardTypes} total={cardTotal} />
              <Rows rows={visibleCardTypes} total={cardTotal} />
              <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
                {credit + debit === 0 ? (
                  "Card type hasn't synced from Finix for these payments yet."
                ) : (
                  <>
                    <span className="font-semibold text-slate-700">{credit >= debit ? "Credit" : "Debit"}</span> cards carry{" "}
                    {percent((Math.max(credit, debit) / cardTotal) * 100)} of card volume. Card type comes from Finix&apos;s
                    payment-instrument record.
                  </>
                )}
              </p>
            </>
          )}
        </>
      )}
    </Card>
  );
}
