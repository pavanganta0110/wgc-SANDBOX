import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import CopyableIdBadge from "@/components/merchant/CopyableIdBadge";
import StateBadge from "@/components/merchant/StateBadge";
import { formatPersonName } from "@/lib/formatPersonName";

function titleCase(s: string | null | undefined) {
  if (!s) return "—";
  return s
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

export default async function RecurringDonorsPage() {
  const session = await getSession();
  const churchId = session!.churchId!;

  const subscriptions = await prisma.finixSubscription.findMany({
    where: { churchId },
    orderBy: { createdAtFinix: "desc" },
    take: 200,
  });

  const instrumentIds = subscriptions
    .map((s) => s.finixPaymentInstrumentId)
    .filter((iid): iid is string => Boolean(iid));
  const instruments = instrumentIds.length
    ? await prisma.finixPaymentInstrumentSnapshot.findMany({
        where: { finixPaymentInstrumentId: { in: instrumentIds } },
      })
    : [];
  const instrumentMap = new Map(instruments.map((i) => [i.finixPaymentInstrumentId, i]));

  const donorIds = instruments.map((i) => i.donorId).filter((did): did is string => Boolean(did));
  const donors = donorIds.length
    ? await prisma.donor.findMany({ where: { id: { in: donorIds } } })
    : [];
  const donorMap = new Map(donors.map((d) => [d.id, d]));

  const activeCount = subscriptions.filter((s) => (s.state || "").toUpperCase() === "ACTIVE").length;
  const recurringVolumeCents = subscriptions
    .filter((s) => (s.state || "").toUpperCase() === "ACTIVE")
    .reduce((sum, s) => sum + (s.amountCents ?? 0), 0);

  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900 mb-6">Recurring Donors</h2>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <p className="text-xs text-slate-500 mb-1">Active Recurring Donors</p>
          <p className="text-2xl font-bold text-slate-900">{activeCount}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <p className="text-xs text-slate-500 mb-1">Recurring Volume (per cycle)</p>
          <p className="text-2xl font-bold text-slate-900">{formatCents(recurringVolumeCents)}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-visible">
        {subscriptions.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-slate-500">
            No recurring donors yet. Once a donor sets up a recurring gift, it will appear here automatically.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50">
                <th className="px-6 py-3">ID</th>
                <th className="px-6 py-3">Donor</th>
                <th className="px-6 py-3">Interval</th>
                <th className="px-6 py-3">State</th>
                <th className="px-6 py-3">Next Billing</th>
                <th className="px-6 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.map((s) => {
                const instrument = s.finixPaymentInstrumentId
                  ? instrumentMap.get(s.finixPaymentInstrumentId)
                  : null;
                const donor = instrument?.donorId ? donorMap.get(instrument.donorId) : null;

                return (
                  <tr key={s.id} className="border-t border-slate-50">
                    <td className="px-6 py-3">
                      <CopyableIdBadge id={s.finixSubscriptionId} />
                    </td>
                    <td className="px-6 py-3 text-slate-700">
                      {formatPersonName(donor?.name, instrument?.accountHolderName)}
                    </td>
                    <td className="px-6 py-3 text-slate-600">{titleCase(s.billingInterval)}</td>
                    <td className="px-6 py-3">
                      <StateBadge state={s.state} />
                    </td>
                    <td className="px-6 py-3 text-slate-600 whitespace-nowrap">
                      {s.nextBillingDate
                        ? new Date(s.nextBillingDate).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "—"}
                    </td>
                    <td className="px-6 py-3 text-right font-semibold text-slate-900">
                      {formatCents(s.amountCents ?? 0)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
