import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import CopyableIdBadge from "@/components/merchant/CopyableIdBadge";
import StateBadge from "@/components/merchant/StateBadge";
import ClosePanelButton from "@/components/merchant/ClosePanelButton";

function formatDateTime(date: Date | null | undefined) {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function DonorDetailPanel({
  donorId,
  churchId,
}: {
  donorId: string;
  churchId: string;
}) {
  const donor = await prisma.donor.findFirst({ where: { id: donorId, churchId } });

  if (!donor) {
    return (
      <div className="w-full lg:w-[420px] shrink-0 border-l border-slate-100 bg-white rounded-2xl lg:rounded-none p-6">
        <p className="text-sm text-slate-500">This donor could not be found.</p>
      </div>
    );
  }

  const instruments = await prisma.finixPaymentInstrumentSnapshot.findMany({
    where: { donorId: donor.id },
  });
  const instrumentIds = instruments.map((i) => i.finixPaymentInstrumentId);

  const transfers = instrumentIds.length
    ? await prisma.finixTransfer.findMany({
        // See the OR-in-null fix in transactions/payments/page.tsx — NOT
        // alone would exclude every null-subtype (i.e. most) transfers too.
        where: {
          churchId,
          finixPaymentInstrumentId: { in: instrumentIds },
          OR: [{ subtype: null }, { NOT: { subtype: { contains: "RETURN" } } }],
        },
        orderBy: { createdAtFinix: "desc" },
        take: 50,
      })
    : [];

  const succeeded = transfers.filter((t) => (t.state || "").toUpperCase() === "SUCCEEDED");
  const totalGiven = succeeded.reduce((sum, t) => sum + (t.amountCents ?? 0), 0);

  return (
    <div className="w-full lg:w-[420px] shrink-0 bg-white border border-slate-100 rounded-2xl shadow-sm h-fit lg:sticky lg:top-6">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
        <h3 className="text-sm font-bold text-slate-900">Donor</h3>
        <ClosePanelButton />
      </div>

      <div className="px-5 py-4 border-b border-slate-100">
        <p className="text-lg font-bold text-slate-900">{donor.name || "Unknown Donor"}</p>
        <div className="mt-3 space-y-1.5 text-sm">
          <Row label="Email" value={donor.email || "—"} />
          <Row label="Phone" value={donor.phone || "—"} />
          <Row label="Donor Since" value={formatDateTime(donor.createdAt)} />
        </div>
      </div>

      <div className="px-5 py-4 border-b border-slate-100 grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-slate-500">Total Given</p>
          <p className="text-lg font-bold text-slate-900">{formatCents(totalGiven)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Gifts</p>
          <p className="text-lg font-bold text-slate-900">{succeeded.length}</p>
        </div>
      </div>

      <div className="px-5 py-4">
        <h3 className="text-sm font-bold text-slate-900 mb-3">Giving History</h3>
        {transfers.length === 0 ? (
          <p className="text-sm text-slate-500">No gifts recorded yet.</p>
        ) : (
          <div className="space-y-3">
            {transfers.map((t) => (
              <div key={t.id} className="flex items-center justify-between text-sm">
                <div>
                  <CopyableIdBadge id={t.finixTransferId} label={t.finixTransferId} variant="link" />
                  <p className="text-xs text-slate-400 mt-0.5">{formatDateTime(t.createdAtFinix)}</p>
                </div>
                <div className="text-right">
                  <StateBadge state={t.state} />
                  <p className="font-semibold text-slate-900 mt-0.5">{formatCents(t.amountCents ?? 0)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm py-1">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-700 text-right">{value}</span>
    </div>
  );
}
