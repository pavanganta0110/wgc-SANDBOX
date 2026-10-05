import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { resolveSafeReturnPath } from "@/lib/safeReturnPath";

/**
 * Shared header for /subscription-terms, /cancellation-procedure, and
 * /support — keeps these pages visually part of the same billing
 * experience as ActivationForm.tsx rather than a disconnected marketing
 * page. returnTo is validated server-side against an allowlist (see
 * safeReturnPath.ts) before ever being used in an href, so this can never
 * become an open redirect.
 */
export default function LegalPageHeader({ title, returnTo }: { title: string; returnTo?: string }) {
  const safeReturnTo = resolveSafeReturnPath(returnTo);

  return (
    <div className="mb-6">
      <div className="flex justify-center mb-6">
        <Link href={safeReturnTo}>
          <img src="/wgc-logo.png" alt="WGC Payments Logo" className="h-10 sm:h-12 object-contain" />
        </Link>
      </div>
      <Link
        href={safeReturnTo}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-700 mb-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#eab308] rounded"
      >
        <ArrowLeft className="w-4 h-4" /> Back to subscription
      </Link>
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">{title}</h1>
    </div>
  );
}
