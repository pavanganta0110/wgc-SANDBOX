import Link from "next/link";
import { HeartHandshake, Ticket, HandCoins, Inbox } from "lucide-react";
import { formatCents } from "@/lib/format";
import { timeAgo, type ActivityItem, type ActivityType } from "@/lib/reports/dashboardHome";

const META: Record<ActivityType, { label: string; Icon: typeof HeartHandshake; chip: string }> = {
  donation: { label: "Donation", Icon: HeartHandshake, chip: "bg-indigo-50 text-indigo-600" },
  registration: { label: "Event registration", Icon: Ticket, chip: "bg-sky-50 text-sky-700" },
  pledge: { label: "Pledge", Icon: HandCoins, chip: "bg-amber-50 text-amber-700" },
};

/** Latest donations, registrations and pledges, newest first. */
export default function ActivityFeed({ items, now = new Date() }: { items: ActivityItem[]; now?: Date }) {
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Recent activity</h2>
          <p className="mt-0.5 text-xs text-slate-500">Donations, registrations and pledges as they happen</p>
        </div>
        <Link href="/merchant/transactions/payments" className="rounded text-sm font-semibold text-indigo-600 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
          All payments
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="mt-5 flex flex-col items-center gap-3 rounded-xl bg-slate-50 px-4 py-10 text-center">
          <Inbox className="h-5 w-5 text-slate-400" aria-hidden />
          <p className="text-sm text-slate-600">No activity yet. Share your giving page to get the first donation.</p>
          <Link
            href="/merchant/giving-links"
            className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
          >
            Open giving pages
          </Link>
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {items.map((item) => {
            const { label, Icon, chip } = META[item.type];
            return (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="flex items-center gap-3 rounded-lg py-3 transition-colors hover:bg-slate-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${chip}`}>
                    <Icon className="h-4 w-4" aria-hidden />
                    <span className="sr-only">{label}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-900">{item.name}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {label}
                      {item.detail ? ` · ${item.detail}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    {item.amountCents != null && (
                      <span className="block text-sm font-bold text-slate-900 tabular-nums">{formatCents(item.amountCents)}</span>
                    )}
                    <time dateTime={item.at.toISOString()} className="block text-xs text-slate-400">
                      {timeAgo(item.at, now)}
                    </time>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
