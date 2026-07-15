import { getSession } from "@/lib/auth/session";
import Link from "next/link";
import StateBadge from "@/components/merchant/StateBadge";
import { getPaymentMethodAvailability, type PaymentMethodAvailability } from "@/lib/payments/paymentMethodAvailability";

const LABELS: Record<string, string> = {
  CARD: "Credit/Debit Card",
  ACH: "ACH / Bank Account",
  APPLE_PAY: "Apple Pay",
  GOOGLE_PAY: "Google Pay",
};

function WalletStatusCard({ title, availability }: { title: string; availability: PaymentMethodAvailability }) {
  return (
    <div className="p-4 rounded-xl border border-slate-100">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        <StateBadge state={availability.displayStatus} />
      </div>
      <div className="grid grid-cols-2 gap-y-2 text-xs text-slate-600">
        <div>Configured for WGC</div>
        <div className="text-right font-medium">{availability.configuredForWgc ? "Yes" : "No"}</div>
        <div>Enabled for Organization</div>
        <div className="text-right font-medium">{availability.enabledForOrganization ? "Yes" : "No"}</div>
        {availability.domainVerified !== null && (
          <>
            <div>Domain Verification</div>
            <div className="text-right font-medium">{availability.domainVerified ? "Verified" : "Not Verified"}</div>
          </>
        )}
        {availability.environment && (
          <>
            <div>Environment</div>
            <div className="text-right font-medium capitalize">{availability.environment}</div>
          </>
        )}
        <div>Device/Browser Support</div>
        <div className="text-right font-medium">Checked at checkout</div>
        <div>Last Checked</div>
        <div className="text-right font-medium">{new Date(availability.lastCheckedAt).toLocaleString()}</div>
      </div>
      {availability.actionRequired && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-3">{availability.actionRequired}</p>
      )}
      <p className="text-xs text-slate-400 mt-3">Available in supported browsers and devices only — this status reflects configuration, not a specific donor's device.</p>
    </div>
  );
}

export default async function PaymentMethodsSettingsPage() {
  const session = await getSession();
  const availability = await getPaymentMethodAvailability(session!.churchId!);
  const [card, ach, applePay, googlePay] = availability;

  const needsAction = availability.some((a) => !a.enabledForOrganization && a.method !== "APPLE_PAY" && a.method !== "GOOGLE_PAY");

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h3 className="text-sm font-bold text-slate-900 mb-1">Payment Methods</h3>
        <p className="text-xs text-slate-500 mb-6">Payment methods available to donors on your Giving Links.</p>

        <div className="space-y-3">
          {[card, ach].map((m) => (
            <div key={m.method} className="flex items-start justify-between p-4 rounded-xl border border-slate-100">
              <div>
                <p className="text-sm font-semibold text-slate-800">{LABELS[m.method]}</p>
                {m.actionRequired && <p className="text-xs text-slate-500 mt-1">{m.actionRequired}</p>}
              </div>
              <StateBadge state={m.displayStatus} />
            </div>
          ))}
        </div>

        {needsAction && (
          <div className="mt-6 pt-6 border-t border-slate-100">
            <p className="text-sm text-slate-600 mb-2">Need to enable a payment method that isn't active yet?</p>
            <Link href="/merchant/support/tickets/new?category=PAYMENT" className="text-sm font-semibold text-blue-600 hover:underline">
              Request Enablement via Support
            </Link>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h3 className="text-sm font-bold text-slate-900 mb-4">Digital Wallets</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <WalletStatusCard title="Apple Pay" availability={applePay} />
          <WalletStatusCard title="Google Pay" availability={googlePay} />
        </div>
      </div>
    </div>
  );
}
