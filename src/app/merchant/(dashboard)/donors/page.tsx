import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import DonorsFilterBar from "@/components/merchant/DonorsFilterBar";
import ClickableTableRow from "@/components/merchant/ClickableTableRow";
import DonorDetailPanel from "@/components/merchant/DonorDetailPanel";

export default async function DonorsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; id?: string }>;
}) {
  const session = await getSession();
  const churchId = session!.churchId!;
  const { q, id } = await searchParams;

  const donors = await prisma.donor.findMany({
    where: {
      churchId,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const donorIds = donors.map((d) => d.id);
  const instruments = donorIds.length
    ? await prisma.finixPaymentInstrumentSnapshot.findMany({ where: { donorId: { in: donorIds } } })
    : [];
  const instrumentIdsByDonor = new Map<string, string[]>();
  for (const i of instruments) {
    if (!i.donorId) continue;
    const list = instrumentIdsByDonor.get(i.donorId) ?? [];
    list.push(i.finixPaymentInstrumentId);
    instrumentIdsByDonor.set(i.donorId, list);
  }

  const allInstrumentIds = instruments.map((i) => i.finixPaymentInstrumentId);
  const transfers = allInstrumentIds.length
    ? await prisma.finixTransfer.findMany({
        where: {
          churchId,
          finixPaymentInstrumentId: { in: allInstrumentIds },
          state: "SUCCEEDED",
          // See the OR-in-null fix in transactions/payments/page.tsx — NOT
          // alone would exclude every null-subtype (i.e. most) transfers too.
          OR: [{ subtype: null }, { NOT: { subtype: { contains: "RETURN" } } }],
        },
      })
    : [];
  const transfersByInstrument = new Map<string, typeof transfers>();
  for (const t of transfers) {
    if (!t.finixPaymentInstrumentId) continue;
    const list = transfersByInstrument.get(t.finixPaymentInstrumentId) ?? [];
    list.push(t);
    transfersByInstrument.set(t.finixPaymentInstrumentId, list);
  }

  const rows = donors.map((donor) => {
    const instrumentIds = instrumentIdsByDonor.get(donor.id) ?? [];
    const donorTransfers = instrumentIds.flatMap((iid) => transfersByInstrument.get(iid) ?? []);
    const totalGivenCents = donorTransfers.reduce((sum, t) => sum + (t.amountCents ?? 0), 0);
    const lastGiftAt = donorTransfers.reduce<Date | null>((latest, t) => {
      if (!t.createdAtFinix) return latest;
      if (!latest || t.createdAtFinix > latest) return t.createdAtFinix;
      return latest;
    }, null);

    return { donor, giftCount: donorTransfers.length, totalGivenCents, lastGiftAt };
  });

  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900 mb-6">Donors</h2>

      <DonorsFilterBar />

      <div className="flex items-start gap-6">
        <div className="flex-1 min-w-0 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-visible">
          {rows.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-slate-500">
              No donors yet. Donors appear here automatically the first time they give.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50">
                  <th className="px-6 py-3">Name</th>
                  <th className="px-6 py-3">Email</th>
                  <th className="px-6 py-3">Phone</th>
                  <th className="px-6 py-3 text-right">Gifts</th>
                  <th className="px-6 py-3 text-right">Total Given</th>
                  <th className="px-6 py-3">Last Gift</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ donor, giftCount, totalGivenCents, lastGiftAt }) => (
                  <ClickableTableRow
                    key={donor.id}
                    id={donor.id}
                    className={`border-t border-slate-50 hover:bg-slate-50 ${
                      id === donor.id ? "bg-slate-50" : ""
                    }`}
                  >
                    <td className="px-6 py-3 font-semibold text-slate-800">
                      {donor.name || "Unknown Donor"}
                    </td>
                    <td className="px-6 py-3 text-slate-600">{donor.email || "—"}</td>
                    <td className="px-6 py-3 text-slate-600">{donor.phone || "—"}</td>
                    <td className="px-6 py-3 text-right text-slate-600">{giftCount}</td>
                    <td className="px-6 py-3 text-right font-semibold text-slate-900">
                      {formatCents(totalGivenCents)}
                    </td>
                    <td className="px-6 py-3 text-slate-600 whitespace-nowrap">
                      {lastGiftAt
                        ? lastGiftAt.toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "—"}
                    </td>
                  </ClickableTableRow>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {id && <DonorDetailPanel donorId={id} churchId={churchId} />}
      </div>
    </div>
  );
}
