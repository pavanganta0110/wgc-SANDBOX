import Link from "next/link";
import {
  ArrowRight,
  Bookmark,
  CalendarRange,
  FileSpreadsheet,
  Repeat,
  UserMinus,
} from "lucide-react";

const CARDS = [
  {
    href: "/merchant/reporting/donors",
    title: "Donor Report",
    description:
      "Filter, customize columns, and export giving data for every donor.",
    Icon: FileSpreadsheet,
  },
  {
    href: "/merchant/reporting/annual",
    title: "Annual Giving Report",
    description:
      "Total giving by calendar year, matching your annual statements.",
    Icon: CalendarRange,
  },
  {
    href: "/merchant/reporting/recurring",
    title: "Recurring Giving",
    description: "Active, paused and canceled recurring donors in one view.",
    Icon: Repeat,
  },
  {
    href: "/merchant/reporting/lapsed",
    title: "Lapsed Donors",
    description:
      "People who haven't given recently, ready for a personal follow-up.",
    Icon: UserMinus,
  },
] as const;

function Item({
  href,
  title,
  description,
  Icon,
  meta,
  className = "",
}: {
  href: string;
  title: string;
  description: string;
  Icon: typeof Bookmark;
  meta?: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`group flex flex-col rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm outline-none transition duration-200 hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${className}`}
    >
      <span
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 transition group-hover:bg-indigo-600 group-hover:text-white motion-reduce:transition-none"
        aria-hidden
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="mt-4 text-sm font-bold text-slate-900">{title}</div>
      <p className="mt-1 flex-1 text-xs leading-relaxed text-slate-500">
        {meta ?? description}
      </p>
      <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600">
        Open{" "}
        <ArrowRight
          className="h-3.5 w-3.5 transition group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
          aria-hidden
        />
      </span>
    </Link>
  );
}

export default function ReportCards({
  savedCount,
}: {
  savedCount: number | null;
}) {
  const saved = savedCount ?? 0;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {CARDS.map((c) => (
        <Item key={c.href} {...c} />
      ))}
      <Item
        href="/merchant/reporting/saved"
        title={saved > 0 ? `Saved Reports · ${saved}` : "Saved Reports"}
        description=""
        meta={
          saved > 0
            ? "Jump back into the report setups you've saved."
            : "Nothing saved yet. Build a report in the Donor Report and save it to find it here."
        }
        Icon={Bookmark}
        className="sm:col-span-2"
      />
    </div>
  );
}
