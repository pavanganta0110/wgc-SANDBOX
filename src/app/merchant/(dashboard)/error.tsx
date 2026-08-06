"use client";

/**
 * Segment-level error boundary for the entire /merchant/(dashboard) route
 * tree — this is what makes the WGC platform-billing access gate
 * (requireMerchantSession's BillingAccessRestrictedError) enforced for
 * every existing page under this segment without editing each one
 * individually. Next.js renders this instead of the page whenever any
 * uncaught error is thrown during that page's render — including every
 * page's own data-fetching queries never running past the
 * requireMerchantSession() call that threw, so no restricted data is ever
 * fetched or returned to the client.
 *
 * Deliberately generic rather than trying to detect the exact error type:
 * client-side error boundaries only receive a serialized Error (message +
 * digest), and guessing at message-matching across server/client
 * boundaries is fragile. Any uncaught dashboard error — billing-restricted
 * or a genuine bug — gets this same safe, non-leaking screen, but now links
 * to /merchant/billing-status: a SERVER component that independently calls
 * requireMerchantSession(true) and reads the real orgAccessState, so the
 * user lands on an accurate, state-specific explanation without this
 * boundary ever needing to know or guess what actually happened.
 */
export default function DashboardErrorBoundary({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-bold text-slate-900 mb-2">This page isn&rsquo;t available right now</h1>
        <p className="text-sm text-slate-500 mb-6">
          This may be because your organization&rsquo;s WGC Platform subscription needs attention, or a temporary error occurred.
        </p>
        <div className="flex items-center justify-center gap-3">
          <a href="/merchant/billing-status" className="px-4 py-2 rounded-full bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800">
            View Account Status
          </a>
          <button onClick={() => reset()} className="px-4 py-2 rounded-full border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            Try Again
          </button>
        </div>
      </div>
    </div>
  );
}
