import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { Send } from "lucide-react";
import { formatCents } from "@/lib/format";
import { formatDateTimeCDT as formatDateTime } from "@/lib/formatDateTimeCDT";
import StateBadge from "@/components/merchant/StateBadge";
import { frequencyLabel } from "@/lib/subscriptions/subscriptionStatus";
import SetupLinkRowActions from "@/components/merchant/SetupLinkRowActions";

export default async function SetupLinksPage() {
  const session = await getSession();
  const churchId = session!.churchId!;

  const links = await prisma.subscriptionSetupLink.findMany({
    where: { churchId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900 mb-6">Setup Links</h2>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
        {links.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="mx-auto w-14 h-14 rounded-full bg-slate-50 flex items-center justify-center mb-3">
              <Send className="w-6 h-6 text-slate-300" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">No setup links</h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto">Secure setup links sent to donors will appear here.</p>
          </div>
        ) : (
          <table className="w-full text-sm min-w-[1000px]">
            <thead>
              <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100">
                <th className="px-6 py-3">Donor</th>
                <th className="px-6 py-3 text-right">Amount</th>
                <th className="px-6 py-3">Frequency</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Sent</th>
                <th className="px-6 py-3">Expires</th>
                <th className="px-6 py-3 w-40" />
              </tr>
            </thead>
            <tbody>
              {links.map((l) => (
                <tr key={l.id} className="border-t border-slate-50">
                  <td className="px-6 py-3">
                    <p className="font-semibold text-slate-800">{[l.donorFirstName, l.donorLastName].filter(Boolean).join(" ") || "—"}</p>
                    <p className="text-xs text-slate-400">{l.donorEmail}</p>
                  </td>
                  <td className="px-6 py-3 text-right font-semibold text-slate-900">{formatCents(l.amountCents)}</td>
                  <td className="px-6 py-3 text-slate-600">{frequencyLabel(l.billingInterval)}</td>
                  <td className="px-6 py-3"><StateBadge state={l.status} /></td>
                  <td className="px-6 py-3 text-slate-600 whitespace-nowrap">{l.sentAt ? formatDateTime(l.sentAt) : "—"}</td>
                  <td className="px-6 py-3 text-slate-600 whitespace-nowrap">{formatDateTime(l.expiresAt)}</td>
                  <td className="px-6 py-3">
                    <SetupLinkRowActions linkId={l.id} status={l.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
