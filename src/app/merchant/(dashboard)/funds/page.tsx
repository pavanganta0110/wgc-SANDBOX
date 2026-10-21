import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, HandCoins, Layers, Trophy, Wallet } from "lucide-react";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { hasPermission } from "@/lib/auth/permissions";
import { resolveViewScope } from "@/lib/auth/viewScope";
import { resolveScopedDonorIds } from "@/lib/auth/scopes";
import { canManageFunds } from "@/lib/giving/fundPermissions";
import { loadFundTotals } from "@/lib/giving/fundTotals";
import { formatCents } from "@/lib/format";
import SummaryStrip from "@/components/merchant/reporting/ui/SummaryStrip";
import FundActions, { AddFundButton } from "@/components/merchant/FundActions";

const RANGES = {
  ytd: "This year",
  "12m": "Last 12 months",
  all: "All time",
} as const;
type RangeKey = keyof typeof RANGES;

function resolveRange(key: RangeKey, now: Date) {
  if (key === "all") return undefined;
  if (key === "12m") return { gte: new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()), lte: now };
  return { gte: new Date(now.getFullYear(), 0, 1), lte: now };
}

export default async function FundsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/dashboard");
    throw err;
  }
  if (!hasPermission(auth, "canViewDonors")) redirect("/merchant/dashboard");

  // Tenant from the session only; a scoped viewer (e.g. a fundraiser) sees
  // only their own donors' gifts, same as Reporting.
  const viewScope = await resolveViewScope(auth);
  const scopedDonorIds = await resolveScopedDonorIds(auth, viewScope);
  const { range: rangeParam } = await searchParams;
  const rangeKey: RangeKey = rangeParam && rangeParam in RANGES ? (rangeParam as RangeKey) : "ytd";
  const rows = await loadFundTotals({
    churchId: auth.churchId,
    range: resolveRange(rangeKey, new Date()),
    donorIds: scopedDonorIds ?? undefined,
  });
  const canManage = canManageFunds(auth);

  const grandTotal = rows.reduce((s, r) => s + r.totalCents, 0);
  const giftCount = rows.reduce((s, r) => s + r.onlineCount + r.offlineCount, 0);
  const activeFunds = rows.filter((r) => r.inCatalog && r.isActive).length;
  const top = rows.filter((r) => r.fundId !== null || r.inCatalog).sort((a, b) => b.totalCents - a.totalCents)[0];
  const visible = rows.filter((r) => r.inCatalog || r.totalCents > 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Funds</h2>
          <p className="mt-1 text-sm text-slate-500">How much has been given to each fund, online and recorded offline.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label="Period" className="flex rounded-xl bg-slate-100 p-0.5">
            {(Object.keys(RANGES) as RangeKey[]).map((k) => (
              <Link
                key={k}
                href={k === "ytd" ? "/merchant/funds" : `/merchant/funds?range=${k}`}
                aria-current={k === rangeKey ? "page" : undefined}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  k === rangeKey ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {RANGES[k]}
              </Link>
            ))}
          </nav>
          {canManage && <AddFundButton />}
        </div>
      </header>

      <SummaryStrip
        items={[
          { label: `Given · ${RANGES[rangeKey]}`, value: formatCents(grandTotal), icon: <Wallet className="h-4 w-4" />, hint: "Before refunds" },
          { label: "Gifts", value: giftCount.toLocaleString("en-US"), icon: <HandCoins className="h-4 w-4" /> },
          { label: "Active funds", value: activeFunds.toLocaleString("en-US"), icon: <Layers className="h-4 w-4" /> },
          {
            label: "Top fund",
            value: top && top.totalCents > 0 ? <span className="text-base">{top.name}</span> : "—",
            icon: <Trophy className="h-4 w-4" />,
            hint: top && top.totalCents > 0 ? formatCents(top.totalCents) : undefined,
          },
        ]}
      />

      <div className="overflow-x-auto rounded-2xl border border-slate-200/70 bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-500">
              <th className="px-5 py-3">Fund</th>
              <th className="px-3 py-3 text-right">Online</th>
              <th className="px-3 py-3 text-right">Recorded offline</th>
              <th className="px-3 py-3 text-right">Total</th>
              <th className="w-40 px-3 py-3">Share</th>
              <th className="px-3 py-3">Last gift</th>
              <th className="px-5 py-3 text-right">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visible.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-slate-500">
                  No funds yet. {canManage ? "Add one to let donors choose where their gift goes." : ""}
                </td>
              </tr>
            )}
            {visible.map((r) => {
              const share = grandTotal > 0 ? (r.totalCents / grandTotal) * 100 : 0;
              const key = r.fundId ?? `name:${r.name}`;
              return (
                <tr key={key} className={r.inCatalog && !r.isActive ? "bg-slate-50/60" : undefined}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">{r.name}</span>
                      {r.inCatalog && !r.isActive && (
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600">Archived</span>
                      )}
                      {!r.inCatalog && r.name !== "No fund" && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700" title="Gifts recorded under this name; the fund is no longer in your list.">
                          Not in fund list
                        </span>
                      )}
                    </div>
                    {r.description && <p className="mt-0.5 text-xs text-slate-500">{r.description}</p>}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-700">
                    {formatCents(r.onlineCents)}
                    <span className="block text-[11px] text-slate-400">{r.onlineCount} gifts</span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-700">
                    {formatCents(r.offlineCents)}
                    <span className="block text-[11px] text-slate-400">{r.offlineCount} gifts</span>
                  </td>
                  <td className="px-3 py-3 text-right font-bold tabular-nums text-slate-900">{formatCents(r.totalCents)}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <span className="block h-full rounded-full bg-indigo-500" style={{ width: `${share}%` }} />
                      </span>
                      <span className="w-9 text-right text-xs tabular-nums text-slate-500">{Math.round(share)}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-xs text-slate-500">{r.lastGiftAt ? r.lastGiftAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {r.name !== "No fund" && r.onlineCount > 0 && (
                        <Link
                          href={`/merchant/transactions/payments?fund=${encodeURIComponent(r.name)}`}
                          className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50"
                        >
                          View gifts <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                        </Link>
                      )}
                      {canManage && r.inCatalog && r.fundId && (
                        <FundActions fundId={r.fundId} name={r.name} description={r.description} isActive={r.isActive} />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        Online gifts are successful payments before refunds. Recorded offline gifts are cash, checks and other gifts entered under External Donations
        (returned checks excluded).
      </p>
    </div>
  );
}
