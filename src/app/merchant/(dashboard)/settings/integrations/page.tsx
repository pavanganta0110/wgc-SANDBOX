import Link from "next/link";
import { ChevronRight } from "lucide-react";
import StateBadge from "@/components/merchant/StateBadge";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";

function IntegrationRow({ name, description, enabled }: { name: string; description: string; enabled: boolean }) {
  return (
    <div className="flex items-start justify-between py-4 border-b border-slate-50 last:border-0">
      <div>
        <div className="text-sm font-semibold text-slate-900">{name}</div>
        <div className="text-xs text-slate-500 mt-0.5">{description}</div>
      </div>
      <StateBadge state={enabled ? "ENABLED" : "DISABLED"} />
    </div>
  );
}

export default async function IntegrationsSettingsPage() {
  const smsConfigured = Boolean(
    process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER
  );

  // Aplos is merchant-configured (each organization connects its own
  // account), unlike the platform-level rows below — shown as its own
  // clickable card with real per-organization status, not a static row.
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (!isAuthError(err)) throw err;
  }
  const aplosStatus = auth
    ? (await prisma.aplosConnection.findUnique({ where: { churchId: auth.churchId }, select: { status: true } }))?.status ?? "NOT_CONNECTED"
    : "NOT_CONNECTED";
  const printfulStatus = auth
    ? (await prisma.printfulConnection.findUnique({ where: { churchId: auth.churchId }, select: { status: true } }))?.status ?? "NOT_CONNECTED"
    : "NOT_CONNECTED";
  const quickBooksStatus = auth
    ? (await prisma.quickBooksConnection.findUnique({ where: { churchId: auth.churchId }, select: { status: true } }))?.status ?? "NOT_CONNECTED"
    : "NOT_CONNECTED";

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h3 className="text-sm font-bold text-slate-900 mb-1">Integrations</h3>
        <p className="text-xs text-slate-500 mb-6">
          Integrations are configured at the platform level by WGC. This page shows which are active for your organization.
        </p>
        <div>
          <IntegrationRow name="Payment Processing" description="Card and ACH payment processing via WGC's payment processor." enabled />
          <IntegrationRow name="Email Delivery" description="Receipts, statements, and notification emails." enabled />
          <IntegrationRow name="Text Message Sharing" description="Send Giving Link shares by text message." enabled={smsConfigured} />
        </div>
        <p className="text-xs text-slate-400 mt-6">
          Need a different integration? <Link href="/merchant/support/tickets/new" className="text-blue-600 hover:underline">Contact Support</Link>.
        </p>
      </div>

      <Link
        href="/merchant/settings/integrations/aplos"
        className="flex items-center justify-between bg-white rounded-2xl border border-slate-100 shadow-sm p-6 hover:border-slate-300 transition"
      >
        <div>
          <div className="text-sm font-bold text-slate-900">Aplos</div>
          <p className="text-xs text-slate-500 mt-0.5 max-w-lg">
            Connect your own Aplos account to automatically send settled contributions from WGC Payments into Aplos.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <StateBadge state={aplosStatus} />
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </div>
      </Link>

      <Link
        href="/merchant/settings/integrations/printful"
        className="flex items-center justify-between bg-white rounded-2xl border border-slate-100 shadow-sm p-6 hover:border-slate-300 transition"
      >
        <div>
          <div className="text-sm font-bold text-slate-900">Printful (Merchandise)</div>
          <p className="text-xs text-slate-500 mt-0.5 max-w-lg">
            Sell merchandise — t-shirts, hoodies, and more — directly on your giving page. Fulfilled and shipped by Printful.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <StateBadge state={printfulStatus} />
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </div>
      </Link>

      <Link
        href="/merchant/settings/integrations/quickbooks"
        className="flex items-center justify-between bg-white rounded-2xl border border-slate-100 shadow-sm p-6 hover:border-slate-300 transition"
      >
        <div>
          <div className="text-sm font-bold text-slate-900">QuickBooks Online</div>
          <p className="text-xs text-slate-500 mt-0.5 max-w-lg">
            Connect your own QuickBooks Online company to sync contributions and customers automatically.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <StateBadge state={quickBooksStatus} />
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </div>
      </Link>
    </div>
  );
}
