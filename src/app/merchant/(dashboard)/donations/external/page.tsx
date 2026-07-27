import Link from "next/link";
import { redirect } from "next/navigation";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { hasPermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import { EXTERNAL_PAYMENT_METHOD_LABELS, SOURCE_LABELS, type ExternalPaymentMethod } from "@/lib/donations/externalDonationTypes";
import ExternalDonationRowActions from "@/components/merchant/ExternalDonationRowActions";

export default async function ExternalDonationsPage() {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/dashboard");
    throw err;
  }

  const [donations, unmatched, donorMap] = await Promise.all([
    prisma.externalDonation.findMany({ where: { churchId: auth.churchId }, orderBy: { donationDate: "desc" }, take: 100 }),
    prisma.externalDonation.findMany({ where: { churchId: auth.churchId, donorMatchStatus: "UNMATCHED" }, orderBy: { donationDate: "desc" } }),
    prisma.donor.findMany({ where: { churchId: auth.churchId }, select: { id: true, name: true, email: true } }),
  ]);
  const donorById = new Map(donorMap.map((d) => [d.id, d]));

  const canCreate = hasPermission(auth, "canCreateExternalDonation");
  const canVoid = hasPermission(auth, "canVoidExternalDonation");
  const canSendReceipt = hasPermission(auth, "canSendExternalDonationReceipt");
  const canMatch = hasPermission(auth, "canMatchExternalDonationToDonor");

  const totalCents = donations
    .filter((d) => d.status !== "VOIDED" && d.depositStatus !== "RETURNED")
    .reduce((sum, d) => sum + d.donationAmountCents, 0);

  return (
    <div className="p-6 md:p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">External Donations</h1>
          <p className="text-sm text-slate-500 mt-1">
            Donations recorded outside WGC Payments. Never processed by Finix — excluded from processing volume, settlement, and fee totals.
          </p>
        </div>
        {canCreate && (
          <Link href="/merchant/donations/external/new" className="rounded-lg bg-[#010409] px-4 py-2.5 text-sm font-semibold text-white">
            Record External Donation
          </Link>
        )}
      </div>

      <div className="rounded-xl border border-slate-100 bg-white p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Total external donations (active)</p>
        <p className="text-2xl font-bold text-slate-900 mt-1">{formatCents(totalCents)}</p>
      </div>

      {unmatched.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50/50">
          <div className="px-5 py-4 border-b border-amber-200">
            <h2 className="text-sm font-semibold text-amber-900">Unmatched External Donations ({unmatched.length})</h2>
            <p className="text-xs text-amber-700 mt-0.5">Money was received but not yet connected to a donor.</p>
          </div>
          <div className="divide-y divide-amber-100">
            {unmatched.map((d) => (
              <div key={d.id} className="flex items-center justify-between px-5 py-3">
                <div className="text-sm">
                  <span className="font-semibold text-slate-900">{formatCents(d.donationAmountCents)}</span>{" "}
                  <span className="text-slate-500">
                    · {EXTERNAL_PAYMENT_METHOD_LABELS[d.paymentMethod as ExternalPaymentMethod]} · {d.donationDate.toLocaleDateString()}
                  </span>
                </div>
                <ExternalDonationRowActions
                  id={d.id}
                  status={d.status}
                  donorMatchStatus={d.donorMatchStatus}
                  canVoid={canVoid}
                  canSendReceipt={canSendReceipt}
                  canMatch={canMatch}
                  hasDonorEmail={false}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-slate-100 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="text-left px-5 py-3">Date</th>
              <th className="text-left px-5 py-3">Donor</th>
              <th className="text-left px-5 py-3">Method</th>
              <th className="text-left px-5 py-3">Source</th>
              <th className="text-right px-5 py-3">Amount</th>
              <th className="text-left px-5 py-3">Status</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {donations.map((d) => {
              const donor = d.donorId ? donorById.get(d.donorId) : null;
              return (
                <tr key={d.id} className={d.status === "VOIDED" ? "opacity-50" : ""}>
                  <td className="px-5 py-3 whitespace-nowrap">{d.donationDate.toLocaleDateString()}</td>
                  <td className="px-5 py-3">{d.isAnonymous ? "Anonymous" : donor?.name || (d.donorMatchStatus === "UNMATCHED" ? <span className="text-amber-600">Unmatched</span> : "—")}</td>
                  <td className="px-5 py-3">{d.paymentMethod === "OTHER" ? d.otherPaymentMethodName : EXTERNAL_PAYMENT_METHOD_LABELS[d.paymentMethod as ExternalPaymentMethod]}</td>
                  <td className="px-5 py-3 text-slate-500">{SOURCE_LABELS[d.source as keyof typeof SOURCE_LABELS]}</td>
                  <td className="px-5 py-3 text-right font-semibold">{formatCents(d.donationAmountCents)}</td>
                  <td className="px-5 py-3">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{d.status}</span>
                    {d.possibleDuplicate && <span className="ml-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Possible duplicate</span>}
                  </td>
                  <td className="px-5 py-3">
                    <ExternalDonationRowActions
                      id={d.id}
                      status={d.status}
                      donorMatchStatus={d.donorMatchStatus}
                      canVoid={canVoid}
                      canSendReceipt={canSendReceipt}
                      canMatch={canMatch}
                      hasDonorEmail={Boolean(donor?.email)}
                    />
                  </td>
                </tr>
              );
            })}
            {donations.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-sm text-slate-400">
                  No external donations recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
