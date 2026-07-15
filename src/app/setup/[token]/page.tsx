import { prisma } from "@/lib/prisma";
import { hashSetupLinkToken } from "@/lib/subscriptions/setupLinkToken";
import { frequencyLabel } from "@/lib/subscriptions/subscriptionStatus";
import { formatCents } from "@/lib/format";
import SetupLinkForm from "@/components/giving/SetupLinkForm";

function ErrorScreen({ title, message }: { title: string; message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-slate-50">
      <div className="max-w-md text-center bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <h1 className="text-xl font-bold text-slate-900 mb-2">{title}</h1>
        <p className="text-sm text-slate-500">{message}</p>
      </div>
    </div>
  );
}

export default async function SetupLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const tokenHash = hashSetupLinkToken(token);
  const link = await prisma.subscriptionSetupLink.findUnique({ where: { tokenHash } });

  if (!link) return <ErrorScreen title="Invalid link" message="This setup link is invalid." />;
  if (link.status === "REVOKED") return <ErrorScreen title="Link revoked" message="This setup link has been revoked by the organization." />;
  if (link.status === "COMPLETED") return <ErrorScreen title="Already used" message="This setup link has already been used to set up a recurring donation." />;
  if (link.expiresAt < new Date()) return <ErrorScreen title="Link expired" message="This setup link has expired. Please ask the organization to send a new one." />;

  const church = await prisma.church.findUnique({ where: { id: link.churchId } });
  const fund = link.fundId ? await prisma.fund.findUnique({ where: { id: link.fundId } }) : null;
  const isPaymentUpdate = Boolean(link.updateTargetFinixSubscriptionId);

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-lg mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <div className="flex items-center gap-3 mb-6">
          {church?.logoUrl && <img src={church.logoUrl} alt="" className="w-10 h-10 rounded-lg object-contain" />}
          <div>
            <p className="text-xs text-slate-400">{isPaymentUpdate ? "Payment Method Update" : "Recurring Donation Setup"}</p>
            <h1 className="text-lg font-bold text-slate-900">{church?.name || "Organization"}</h1>
          </div>
        </div>

        <div className="bg-slate-50 rounded-xl p-4 mb-6 space-y-1.5 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">Amount</span><span className="font-bold text-slate-900">{formatCents(link.amountCents)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Frequency</span><span className="font-semibold text-slate-800">{frequencyLabel(link.billingInterval)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Start Date</span><span className="font-semibold text-slate-800">{link.startDate.toLocaleDateString("en-US")}</span></div>
          {link.endDate && <div className="flex justify-between"><span className="text-slate-500">End Date</span><span className="font-semibold text-slate-800">{link.endDate.toLocaleDateString("en-US")}</span></div>}
          {fund && <div className="flex justify-between"><span className="text-slate-500">Fund/Campaign</span><span className="font-semibold text-slate-800">{fund.name}</span></div>}
        </div>

        {link.message && <p className="text-sm text-slate-600 mb-6">{link.message}</p>}

        <SetupLinkForm
          token={token}
          organizationName={church?.name || "this organization"}
          donorFirstName={link.donorFirstName}
          donorLastName={link.donorLastName}
          donorEmail={link.donorEmail}
          isPaymentUpdate={isPaymentUpdate}
        />

        <p className="text-xs text-slate-400 mt-6">
          You may cancel this recurring donation at any time by contacting {church?.name || "the organization"} directly. Your payment information is processed securely and is never stored by WGC in raw form.
        </p>
      </div>
    </div>
  );
}
