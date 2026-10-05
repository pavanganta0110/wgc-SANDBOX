import type { Metadata } from "next";
import LegalPageHeader from "@/components/support/LegalPageHeader";
import SubscriptionLegalFooterLinks from "@/components/support/SubscriptionLegalFooterLinks";
import { resolveSafeReturnPath } from "@/lib/safeReturnPath";

export const metadata: Metadata = {
  title: "Cancellation Procedure | WGC Payments",
  description: "How to cancel your WGC Payments subscription, what happens to your dashboard access and data, and how to get help.",
  alternates: { canonical: "/cancellation-procedure" },
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-bold text-slate-900 mb-2">{title}</h2>
      <div className="text-sm text-slate-600 leading-relaxed space-y-2">{children}</div>
    </section>
  );
}

export default async function CancellationProcedurePage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const { returnTo } = await searchParams;
  const safeReturnTo = resolveSafeReturnPath(returnTo);
  const supportHref = `/support?category=Cancellation%20request&returnTo=${encodeURIComponent(safeReturnTo)}`;

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 flex flex-col items-center">
      <div className="max-w-2xl w-full bg-white rounded-2xl border border-slate-100 shadow-sm p-8">
        <LegalPageHeader title="Cancellation Procedure" returnTo={returnTo} />

        <div className="space-y-6 mt-6">
          <Section title="How to Cancel">
            <p>
              A subscription can be canceled directly from your merchant dashboard — go to{" "}
              <strong>Billing &amp; Subscription</strong>, and select <strong>Cancel Subscription</strong>. You&apos;ll be asked to confirm before
              the cancellation takes effect.
            </p>
          </Section>

          <Section title="When Cancellation Takes Effect">
            <p>
              Cancellation is effective immediately — your subscription status changes to canceled as soon as you confirm, and no further
              renewal charges will occur.
            </p>
          </Section>

          <Section title="Dashboard Access After Cancellation">
            <p>
              Once canceled, full dashboard access is restricted. You&apos;ll still be able to reach billing management and support so you can
              reactivate or reach our team, but day-to-day merchant tools (donations, invoicing, reporting, etc.) are locked until the
              subscription is reactivated.
            </p>
          </Section>

          <Section title="Your Transaction and Reporting Data">
            <p>
              Cancellation does not delete your organization&apos;s transaction history, settlement records, or reporting data. That data is
              retained and becomes visible again if you reactivate.
            </p>
          </Section>

          <Section title="Refunds">
            <p>
              Subscription fees already charged for the current billing period are generally non-refundable. Cancellation stops all future
              charges but does not retroactively refund the period already paid for.
            </p>
          </Section>

          <Section title="If You Can't Access Your Dashboard">
            <p>
              If you&apos;re unable to log in to request cancellation yourself, contact our support team and we&apos;ll help directly.
            </p>
            <a
              href={supportHref}
              className="inline-block mt-2 px-5 py-2.5 rounded-full bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#eab308]"
            >
              Contact Support
            </a>
          </Section>

          <Section title="Confirmation Email">
            <p>Once your cancellation is processed, we send a confirmation email to your organization&apos;s billing contact.</p>
          </Section>

          <Section title="Reactivating">
            <p>
              You can reactivate at any time from the Billing &amp; Subscription page in your dashboard — reactivation starts a new billing cycle
              at the price shown at that time.
            </p>
          </Section>
        </div>

        <div className="mt-10 pt-6 border-t border-slate-100">
          <SubscriptionLegalFooterLinks returnTo={safeReturnTo} />
        </div>
      </div>
    </div>
  );
}
