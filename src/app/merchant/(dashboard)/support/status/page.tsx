import { CheckCircle2 } from "lucide-react";
import StateBadge from "@/components/merchant/StateBadge";

function ServiceRow({ name, description, operational }: { name: string; description: string; operational: boolean }) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-slate-50 last:border-0">
      <div>
        <div className="text-sm font-semibold text-slate-900">{name}</div>
        <div className="text-xs text-slate-500 mt-0.5">{description}</div>
      </div>
      <StateBadge state={operational ? "OPERATIONAL" : "OUTAGE"} />
    </div>
  );
}

export default function SystemStatusPage() {
  const finixConfigured = Boolean(process.env.FINIX_BASE_URL);
  const emailConfigured = Boolean(process.env.RESEND_API_KEY);
  const smsConfigured = Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER);

  const allOperational = finixConfigured && emailConfigured;

  return (
    <div className="space-y-6 max-w-2xl">
      <h2 className="text-lg font-bold text-slate-900">System Status</h2>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle2 className={`w-5 h-5 ${allOperational ? "text-green-600" : "text-amber-600"}`} />
          <span className="text-sm font-bold text-slate-900">
            {allOperational ? "All Systems Operational" : "Some Services Need Attention"}
          </span>
        </div>
        <ServiceRow name="Payment Processing" description="Card and ACH donation processing" operational={finixConfigured} />
        <ServiceRow name="Dashboard" description="This WGC Payments dashboard" operational />
        <ServiceRow name="Email Delivery" description="Receipts, statements, and notifications" operational={emailConfigured} />
        <ServiceRow name="Text Message Sharing" description="Giving Link SMS sharing" operational={smsConfigured} />
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h3 className="text-sm font-bold text-slate-900 mb-2">Recent Incidents</h3>
        <p className="text-sm text-slate-500">No incidents to report.</p>
      </div>
    </div>
  );
}
