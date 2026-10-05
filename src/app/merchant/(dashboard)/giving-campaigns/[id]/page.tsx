import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { formatDateTimeCDT as formatDateTime } from "@/lib/formatDateTimeCDT";
import StateBadge from "@/components/merchant/StateBadge";

export default async function GivingCampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  const permissions = getDonorPermissions(session?.role);
  if (!session?.churchId || !permissions.canView) {
    redirect("/merchant/dashboard");
  }
  const churchId = session.churchId;
  const { id } = await params;

  const campaign = await prisma.givingCampaign.findFirst({ where: { id, churchId } });
  if (!campaign) notFound();

  const recipients = await prisma.givingCampaignRecipient.findMany({
    where: { campaignId: campaign.id, churchId },
    orderBy: { createdAt: "asc" },
  });

  const paidCount = recipients.filter((r) => r.paidAt).length;
  const clickedCount = recipients.filter((r) => r.clickedAt).length;
  const sentCount = recipients.filter((r) => r.sendStatus === "SENT").length;
  const failedCount = recipients.filter((r) => r.sendStatus === "FAILED").length;

  return (
    <div>
      <Link href="/merchant/giving-campaigns" className="text-sm text-blue-600 hover:underline flex items-center gap-1 mb-4">
        <ArrowLeft className="w-4 h-4" /> All Campaigns
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{campaign.name}</h2>
          <p className="text-sm text-slate-500 mt-1">
            {campaign.channel === "TEXT" ? "Text message" : campaign.emailSubject}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{campaign.channel === "TEXT" ? "Text" : "Email"}</span>
          <StateBadge state={campaign.status} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-xs text-slate-500">Sent</p>
          <p className="text-2xl font-bold text-slate-900">{sentCount}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-xs text-slate-500">Clicked</p>
          <p className="text-2xl font-bold text-slate-900">{clickedCount}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-xs text-slate-500">Paid</p>
          <p className="text-2xl font-bold text-green-600">{paidCount}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-xs text-slate-500">Failed</p>
          <p className="text-2xl font-bold text-red-600">{failedCount}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100">
              <th className="px-6 py-3">Donor</th>
              <th className="px-6 py-3">Sent</th>
              <th className="px-6 py-3">Clicked</th>
              <th className="px-6 py-3">Paid</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {recipients.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-6 py-3">
                  <p className="font-medium text-slate-900">{r.recipientName || "—"}</p>
                  <p className="text-xs text-slate-500">{campaign.channel === "TEXT" ? r.recipientPhone : r.recipientEmail}</p>
                </td>
                <td className="px-6 py-3">
                  {r.sendStatus === "SENT" ? (
                    <span className="text-slate-600">{r.sentAt ? formatDateTime(r.sentAt) : "Sent"}</span>
                  ) : r.sendStatus === "FAILED" ? (
                    <span className="text-red-600" title={r.sendError || undefined}>
                      Failed
                    </span>
                  ) : (
                    <span className="text-slate-400">Pending</span>
                  )}
                </td>
                <td className="px-6 py-3 text-slate-600">{r.clickedAt ? formatDateTime(r.clickedAt) : "—"}</td>
                <td className="px-6 py-3">
                  {r.paidAt ? (
                    <span className="text-green-600 font-semibold">{formatDateTime(r.paidAt)}</span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
