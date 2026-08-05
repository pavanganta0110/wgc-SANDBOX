import Link from "next/link";

/** Persistent, non-dismissable banner shown while an organization's Finix
 * merchant is approved but WGC platform-subscription billing setup hasn't
 * been completed yet — see Church.billingSetupStatus. */
export default function BillingGateBanner() {
  return (
    <div className="bg-amber-500 text-white text-sm px-6 py-3 flex items-center justify-between gap-4">
      <p>
        <strong>Action needed:</strong> finish setting up your WGC Platform subscription billing to unlock full dashboard access.
      </p>
      <Link href="/merchant/subscription" className="whitespace-nowrap px-4 py-1.5 rounded-full bg-white text-amber-700 font-semibold hover:bg-amber-50">
        Finish Setup
      </Link>
    </div>
  );
}
