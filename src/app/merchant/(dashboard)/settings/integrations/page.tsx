import StateBadge from "@/components/merchant/StateBadge";

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

  return (
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
        Need a different integration? <a href="/merchant/support/tickets/new" className="text-blue-600 hover:underline">Contact Support</a>.
      </p>
    </div>
  );
}
