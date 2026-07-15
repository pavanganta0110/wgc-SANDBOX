import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import { formatDateCDT, formatTimeCDT, formatDateTimeCDT } from "@/lib/formatDateTimeCDT";
import { resolveGivingLinkStatus } from "@/lib/givingLinks/status";
import CopyableIdBadge from "@/components/merchant/CopyableIdBadge";
import StateBadge from "@/components/merchant/StateBadge";
import GivingLinkRowActions from "@/components/merchant/GivingLinkRowActions";
import GivingLinksFilterBar from "@/components/merchant/GivingLinksFilterBar";
import { resolveDateRange } from "@/lib/dateRangePresets";
import Link from "next/link";

function StackedDateTime({ date }: { date: Date | null | undefined }) {
  if (!date) return <span className="text-slate-400">—</span>;
  return (
    <div className="whitespace-nowrap">
      <p className="text-slate-700">{formatDateCDT(date)}</p>
      <p className="text-xs text-slate-400">{formatTimeCDT(date)} CDT</p>
    </div>
  );
}

export default async function GivingLinksTable({
  churchId,
  searchParams,
}: {
  churchId: string;
  searchParams: Record<string, string | undefined>;
}) {
  const { status, linkType, amountType, name, range, from, to } = searchParams;
  const { from: startDate, to: endDate } = resolveDateRange(range, from, to);
  const dateFilter = startDate ? { gte: startDate, ...(endDate ? { lte: endDate } : {}) } : undefined;

  const allLinks = await prisma.givingLink.findMany({
    where: {
      churchId,
      ...(linkType ? { linkType } : {}),
      ...(amountType ? { amountType } : {}),
      ...(name ? { internalName: { contains: name, mode: "insensitive" } } : {}),
      ...(dateFilter ? { createdAt: dateFilter } : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  const links = status ? allLinks.filter((l) => resolveGivingLinkStatus(l) === status) : allLinks;

  return (
    <>
      <GivingLinksFilterBar exportHref="/api/merchant/giving-links/export" />

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
        {links.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <h3 className="text-sm font-bold text-slate-900 mb-1">Create your first giving link</h3>
            <p className="text-sm text-slate-500 mb-4">
              Create a customized link that donors can use to give online.
            </p>
            <Link
              href="/merchant/giving-links/create"
              className="inline-flex items-center px-4 py-2 rounded-xl bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Create Giving Link
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm min-w-[1300px]">
            <thead>
              <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50">
                <th className="px-6 py-3">ID</th>
                <th className="px-6 py-3">Created (CDT)</th>
                <th className="px-6 py-3">Giving Link Name</th>
                <th className="px-6 py-3">Amount Type</th>
                <th className="px-6 py-3">Link Type</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Total Attempts</th>
                <th className="px-6 py-3 text-right">Successful Donations</th>
                <th className="px-6 py-3 text-right">Total Collected</th>
                <th className="px-6 py-3">Last Used</th>
                <th className="px-6 py-3">Expires</th>
                <th className="px-6 py-3">Updated (CDT)</th>
                <th className="px-6 py-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {links.map((l) => {
                const effectiveStatus = resolveGivingLinkStatus(l);
                return (
                  <tr
                    key={l.id}
                    className="border-t border-slate-50 hover:bg-slate-50 cursor-pointer"
                    onClick={undefined}
                  >
                    <td className="px-6 py-3">
                      <Link href={`/merchant/giving-links/${l.id}`}>
                        <CopyableIdBadge id={l.id} />
                      </Link>
                    </td>
                    <td className="px-6 py-3">
                      <StackedDateTime date={l.createdAt} />
                    </td>
                    <td className="px-6 py-3">
                      <Link href={`/merchant/giving-links/${l.id}`} className="block">
                        <p className="text-slate-800 font-medium">{l.internalName}</p>
                        {l.publicTitle && l.publicTitle !== l.internalName && (
                          <p className="text-xs text-slate-400">{l.publicTitle}</p>
                        )}
                      </Link>
                    </td>
                    <td className="px-6 py-3">
                      <p className="text-slate-700">{l.amountType === "VARIABLE" ? "Variable Amount" : "Fixed Amount"}</p>
                      {l.amountType === "FIXED" && l.fixedAmountCents != null && (
                        <p className="text-xs text-slate-400">{formatCents(l.fixedAmountCents)}</p>
                      )}
                    </td>
                    <td className="px-6 py-3 text-slate-700">
                      {l.linkType === "ONE_TIME" ? "One-Time Link" : "Multi-Use Link"}
                    </td>
                    <td className="px-6 py-3">
                      <StateBadge state={effectiveStatus} />
                    </td>
                    <td className="px-6 py-3 text-right text-slate-700">{l.totalAttempts}</td>
                    <td className="px-6 py-3 text-right text-slate-700">{l.successfulDonations}</td>
                    <td className="px-6 py-3 text-right">
                      <span className="font-bold text-slate-900">{formatCents(l.totalCollectedCents)}</span>
                      <p className="text-xs text-slate-400">Gross</p>
                    </td>
                    <td className="px-6 py-3 text-slate-600 whitespace-nowrap">
                      {l.lastUsedAt ? formatDateTimeCDT(l.lastUsedAt) : "—"}
                    </td>
                    <td className="px-6 py-3 text-slate-600 whitespace-nowrap">
                      {l.expiresAt ? formatDateTimeCDT(l.expiresAt) : "No expiration"}
                    </td>
                    <td className="px-6 py-3">
                      <StackedDateTime date={l.updatedAt} />
                    </td>
                    <td className="px-6 py-3">
                      <GivingLinkRowActions
                        id={l.id}
                        publicSlug={l.publicSlug}
                        publicTitle={l.publicTitle}
                        status={effectiveStatus}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
