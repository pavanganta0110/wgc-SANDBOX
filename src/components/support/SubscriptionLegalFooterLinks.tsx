import Link from "next/link";

/**
 * The four subscription-related legal/support links — shared by
 * ActivationForm.tsx and every page they link to, so the same set (and
 * the same returnTo-preserving behavior) appears anywhere the subscription
 * activation flow is displayed, not just on one screen.
 */
export default function SubscriptionLegalFooterLinks({ returnTo = "/test-billing-form" }: { returnTo?: string }) {
  const rt = encodeURIComponent(returnTo);
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-slate-400">
      <Link href={`/subscription-terms?returnTo=${rt}`} className="hover:underline hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#eab308] rounded">
        Subscription Terms
      </Link>
      <Link href="/legal/privacy" className="hover:underline hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#eab308] rounded">
        Privacy Policy
      </Link>
      <Link href={`/cancellation-procedure?returnTo=${rt}`} className="hover:underline hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#eab308] rounded">
        Cancellation Procedure
      </Link>
      <Link href={`/support?returnTo=${rt}`} className="hover:underline hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#eab308] rounded">
        Support
      </Link>
    </div>
  );
}
