import type { Metadata } from "next";
import LegalPageHeader from "@/components/support/LegalPageHeader";
import SubscriptionLegalFooterLinks from "@/components/support/SubscriptionLegalFooterLinks";
import SupportForm from "@/components/support/SupportForm";
import { resolveSafeReturnPath } from "@/lib/safeReturnPath";

export const metadata: Metadata = {
  title: "Support | WGC Payments",
  description: "Get help with your WGC Payments subscription, billing, account access, or a technical issue.",
  alternates: { canonical: "/support" },
};

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ returnTo?: string; category?: string }> }) {
  const { returnTo, category } = await searchParams;
  const safeReturnTo = resolveSafeReturnPath(returnTo);

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 flex flex-col items-center">
      <div className="max-w-2xl w-full bg-white rounded-2xl border border-slate-100 shadow-sm p-8">
        <LegalPageHeader title="How can we help?" returnTo={returnTo} />
        <p className="text-sm text-slate-500 mb-8">
          Tell us what&apos;s going on and our team will get back to you within one business day. You can also reach us directly at{" "}
          <a href={`mailto:${process.env.SUPPORT_EMAIL || "support@wgcpayments.com"}`} className="text-slate-900 underline font-semibold">
            {process.env.SUPPORT_EMAIL || "support@wgcpayments.com"}
          </a>
          .
        </p>

        <div className="grid sm:grid-cols-3 gap-3 mb-8 text-xs">
          {["Subscription & billing", "Account access", "Cancellation"].map((topic) => (
            <div key={topic} className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 text-slate-600 font-semibold text-center">
              {topic}
            </div>
          ))}
        </div>

        <SupportForm initialCategory={category} />

        <div className="mt-10 pt-6 border-t border-slate-100">
          <SubscriptionLegalFooterLinks returnTo={safeReturnTo} />
        </div>
      </div>
    </div>
  );
}
