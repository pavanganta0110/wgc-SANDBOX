import type { Metadata } from "next";
import LegalPageHeader from "@/components/support/LegalPageHeader";
import SubscriptionLegalFooterLinks from "@/components/support/SubscriptionLegalFooterLinks";
import { resolveSafeReturnPath } from "@/lib/safeReturnPath";

export const metadata: Metadata = {
  title: "Subscription Terms | WGC Payments",
  description: "The terms governing WGC Payments' merchant software subscription — billing, renewal, cancellation, and merchant responsibilities.",
  alternates: { canonical: "/subscription-terms" },
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-bold text-slate-900 mb-2">{title}</h2>
      <div className="text-sm text-slate-600 leading-relaxed space-y-2">{children}</div>
    </section>
  );
}

export default async function SubscriptionTermsPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const { returnTo } = await searchParams;
  const safeReturnTo = resolveSafeReturnPath(returnTo);

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 flex flex-col items-center">
      <div className="max-w-2xl w-full bg-white rounded-2xl border border-slate-100 shadow-sm p-8">
        <LegalPageHeader title="Subscription Terms" returnTo={returnTo} />

        <div className="space-y-6 mt-6">
          <Section title="1. Overview">
            <p>
              These Subscription Terms govern your organization&apos;s use of the WGC Payments platform subscription (&quot;the Subscription&quot;) —
              the recurring software fee charged separately from any donation, invoice, or transaction processing fees your organization or its
              donors pay through WGC.
            </p>
          </Section>

          <Section title="2. Subscription Eligibility">
            <p>
              The Subscription is available to organizations approved through WGC&apos;s onboarding and identity verification process. An
              organization must have an active, approved merchant account before a subscription can be activated.
            </p>
          </Section>

          <Section title="3. Billing Terms">
            <p>
              The Subscription is billed monthly at the price displayed at activation, unless a different billing interval is explicitly shown
              on your activation screen. The price shown at activation reflects any applicable promotional terms for your organization.
            </p>
          </Section>

          <Section title="4. Automatic Renewal">
            <p>
              The Subscription renews automatically at the end of each billing period and continues until canceled. If your organization is on a
              promotional period, the Subscription automatically converts to the regular price once that period ends, unless canceled beforehand.
            </p>
          </Section>

          <Section title="5. Payment Authorization">
            <p>
              <strong>Activating a subscription authorizes WGC Payments to charge your organization using the selected payment method</strong>,
              at the price and billing frequency displayed on the activation screen, on each renewal date until the Subscription is canceled.
            </p>
          </Section>

          <Section title="6. Failed Payments">
            <p>
              If a subscription charge fails, WGC will attempt to notify your organization and may restrict dashboard access to a limited set of
              features (including billing management and support) until the payment method is updated or the balance is resolved, subject to any
              grace period WGC provides.
            </p>
          </Section>

          <Section title="7. Subscription Activation">
            <p>
              A subscription is considered active once payment authorization is completed and WGC confirms activation. Access to the full
              merchant dashboard is unlocked upon activation.
            </p>
          </Section>

          <Section title="8. Subscription Cancellation">
            <p>
              You may cancel your Subscription at any time from your merchant dashboard. See our{" "}
              <a href={`/cancellation-procedure?returnTo=${encodeURIComponent(safeReturnTo)}`} className="text-slate-900 underline font-semibold">
                Cancellation Procedure
              </a>{" "}
              for full details on how cancellation works.
            </p>
          </Section>

          <Section title="9. Refund Policy">
            <p>
              Subscription fees already charged for a billing period are generally non-refundable for that period, except where required by law
              or where WGC determines a billing error occurred. Cancellation stops future charges but does not retroactively refund the current
              period.
            </p>
          </Section>

          <Section title="10. Account Suspension or Termination">
            <p>
              WGC may suspend or terminate a subscription and associated dashboard access for non-payment, violation of these terms, or violation
              of WGC&apos;s underlying merchant agreement with its payment processing partners.
            </p>
          </Section>

          <Section title="11. Pricing Changes">
            <p>
              WGC may update Subscription pricing for new billing periods. Pricing changes are never applied retroactively to periods already
              billed. Where required, WGC will provide advance notice of a pricing change before it takes effect for your organization.
            </p>
          </Section>

          <Section title="12. Merchant Responsibilities">
            <p>
              Your organization is responsible for keeping billing and contact information current, monitoring subscription status, and ensuring
              an authorized representative manages the account.
            </p>
          </Section>

          <Section title="13. Limitation of Liability">
            <p>
              To the maximum extent permitted by law, WGC&apos;s liability arising from the Subscription is limited to the amount your
              organization paid for the Subscription in the twelve months preceding the claim.
            </p>
          </Section>

          <Section title="14. Changes to These Terms">
            <p>
              WGC may update these Subscription Terms from time to time. Continued use of the Subscription after an update constitutes acceptance
              of the revised terms.
            </p>
          </Section>

          <Section title="15. Contact">
            <p>
              Questions about your subscription can be directed to our{" "}
              <a href={`/support?returnTo=${encodeURIComponent(safeReturnTo)}`} className="text-slate-900 underline font-semibold">
                Support page
              </a>{" "}
              or {process.env.SUPPORT_EMAIL || "support@wgcpayments.com"}.
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
