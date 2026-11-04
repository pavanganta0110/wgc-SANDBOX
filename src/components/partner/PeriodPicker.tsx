/** A plain GET form (no client code): month picker plus "All time", keeping any other filters passed as hidden fields. */
export default function PeriodPicker({ action, periodKey, hidden = {} }: { action: string; periodKey: string; hidden?: Record<string, string> }) {
  return (
    <form action={action} method="get" className="flex flex-wrap items-center gap-2">
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <input type="month" name="period" defaultValue={periodKey === "all" ? "" : periodKey} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" aria-label="Month" />
      <button className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Show month</button>
      <a href={`${action}?period=all${Object.entries(hidden).map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join("")}`} className={`px-3 py-2 text-sm font-semibold ${periodKey === "all" ? "text-slate-900" : "text-blue-600 hover:underline"}`}>All time</a>
    </form>
  );
}
