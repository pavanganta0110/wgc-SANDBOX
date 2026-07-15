import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import { formatDateTimeCDT } from "@/lib/formatDateTimeCDT";
import StateBadge from "@/components/merchant/StateBadge";

const CHANNEL_LABELS: Record<string, string> = {
  COPY_LINK: "Copy Link",
  QR_CODE: "QR Code",
  EMAIL: "Email",
  TEXT: "Text Message",
  MANUAL: "Manual Share",
  EMBED: "Embedded Website",
};

export default async function GivingLinkSharingHistoryTable({ givingLinkId, churchId }: { givingLinkId: string; churchId: string }) {
  const shares = await prisma.givingLinkShare.findMany({
    where: { givingLinkId, churchId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  if (shares.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-6 py-16 text-center">
        <h3 className="text-sm font-bold text-slate-900 mb-1">No sharing activity</h3>
        <p className="text-sm text-slate-500">Email, text, QR-code, and copy-link activity will appear here.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
      <table className="w-full text-sm min-w-[900px]">
        <thead>
          <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50">
            <th className="px-6 py-3">Shared At</th>
            <th className="px-6 py-3">Channel</th>
            <th className="px-6 py-3">Recipient</th>
            <th className="px-6 py-3">Status</th>
            <th className="px-6 py-3">Opened</th>
          </tr>
        </thead>
        <tbody>
          {shares.map((s) => (
            <tr key={s.id} className="border-t border-slate-50">
              <td className="px-6 py-3 text-slate-600 whitespace-nowrap">{formatDateTimeCDT(s.createdAt)}</td>
              <td className="px-6 py-3 text-slate-700">{CHANNEL_LABELS[s.channel] || s.channel}</td>
              <td className="px-6 py-3 text-slate-700">{s.recipient || "—"}</td>
              <td className="px-6 py-3">
                <StateBadge state={s.state} />
              </td>
              <td className="px-6 py-3 text-slate-600">{s.openedAt ? formatDateTimeCDT(s.openedAt) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
