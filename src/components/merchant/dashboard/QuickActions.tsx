import Link from "next/link";
import { CreditCard, HeartHandshake, CalendarPlus, Megaphone, Landmark } from "lucide-react";
import TakePaymentAction from "./TakePaymentAction";

const CARD =
  "group flex w-full flex-col items-start gap-3 rounded-2xl border border-slate-200/70 bg-white p-4 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-[0_6px_20px_rgba(15,23,42,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0";

function Inner({ icon, title, hint }: { icon: React.ReactNode; title: string; hint: string }) {
  return (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 transition-colors group-hover:bg-indigo-600 group-hover:text-white motion-reduce:transition-none" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-900">{title}</span>
        <span className="mt-0.5 block text-xs leading-snug text-slate-500">{hint}</span>
      </span>
    </>
  );
}

export default function QuickActions({
  finixMerchantId,
  churchName,
  pricing,
}: {
  finixMerchantId: string;
  churchName: string;
  pricing: { cardPercentageFee: number | null; cardFixedFeeCents: number | null; achFixedFeeCents: number | null };
}) {
  const icon = "h-5 w-5";
  return (
    <section aria-labelledby="quick-actions">
      <h2 id="quick-actions" className="mb-3 text-sm font-semibold text-slate-900">
        Quick actions
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <TakePaymentAction finixMerchantId={finixMerchantId} churchName={churchName} pricing={pricing} className={CARD}>
          <Inner icon={<CreditCard className={icon} />} title="Take a payment" hint="Charge a donor now" />
        </TakePaymentAction>
        <Link href="/merchant/giving-links/create" className={CARD}>
          <Inner icon={<HeartHandshake className={icon} />} title="Create giving page" hint="Share a link to give" />
        </Link>
        <Link href="/merchant/events/new" className={CARD}>
          <Inner icon={<CalendarPlus className={icon} />} title="New event" hint="Sell tickets, track guests" />
        </Link>
        <Link href="/merchant/campaigns/new" className={CARD}>
          <Inner icon={<Megaphone className={icon} />} title="New campaign" hint="Fundraise toward a goal" />
        </Link>
        <Link href="/merchant/deposits" className={CARD}>
          <Inner icon={<Landmark className={icon} />} title="View deposits" hint="See what reached your bank" />
        </Link>
      </div>
    </section>
  );
}
