import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { hasPermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import { EXTERNAL_PAYMENT_METHOD_LABELS, SOURCE_LABELS, type ExternalPaymentMethod } from "@/lib/donations/externalDonationTypes";
import ExternalDonationDetailPanel from "@/components/merchant/ExternalDonationDetailPanel";
import { resolveExternalDonationScopedUserId } from "@/lib/donations/externalDonationScope";

export default async function ExternalDonationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/dashboard");
    throw err;
  }

  const { id } = await params;
  const scopedUserId = await resolveExternalDonationScopedUserId(auth);
  const donation = await prisma.externalDonation.findFirst({
    where: { id, churchId: auth.churchId, ...(scopedUserId ? { createdByUserId: scopedUserId } : {}) },
    include: { auditLogs: { orderBy: { createdAt: "desc" } } },
  });
  if (!donation) notFound();

  const donor = donation.donorId ? await prisma.donor.findUnique({ where: { id: donation.donorId } }) : null;

  const canEdit = hasPermission(auth, "canEditExternalDonation");
  const canVoid = hasPermission(auth, "canVoidExternalDonation");
  const canViewProof = hasPermission(auth, "canViewExternalDonationProof");

  const methodLabel =
    donation.paymentMethod === "OTHER" ? donation.otherPaymentMethodName || "Other" : EXTERNAL_PAYMENT_METHOD_LABELS[donation.paymentMethod as ExternalPaymentMethod];

  return (
    <div className="p-6 md:p-8 max-w-3xl space-y-6">
      <div>
        <Link href="/merchant/donations/external" className="text-xs font-semibold text-slate-500 hover:underline">
          ← External Donations
        </Link>
        <div className="flex items-center justify-between mt-2">
          <h1 className="text-2xl font-bold text-slate-900">{formatCents(donation.donationAmountCents)}</h1>
          <span className="text-sm text-slate-500">{donation.donationDate.toLocaleDateString()}</span>
        </div>
        <p className="text-sm text-slate-500 mt-1">
          {methodLabel} · {SOURCE_LABELS[donation.source as keyof typeof SOURCE_LABELS]}
        </p>
      </div>

      <section className="rounded-xl border border-slate-100 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900 mb-2">Donor</h2>
        {donation.isAnonymous ? (
          <p className="text-sm text-slate-700">Anonymous</p>
        ) : donor ? (
          <div className="text-sm">
            <p className="font-medium text-slate-900">{donor.name || "Unnamed donor"}</p>
            {donor.email && <p className="text-slate-500">{donor.email}</p>}
          </div>
        ) : (
          <p className="text-sm text-amber-600">Unmatched — connect a donor from the External Donations list</p>
        )}
      </section>

      <ExternalDonationDetailPanel
        donation={{
          id: donation.id,
          status: donation.status,
          depositStatus: donation.depositStatus,
          paymentMethod: donation.paymentMethod,
          donationAmountCents: donation.donationAmountCents,
          donationDate: donation.donationDate.toISOString(),
          fundName: donation.fundName,
          campaign: donation.campaign,
          donationPurpose: donation.donationPurpose,
          externalTransactionId: donation.externalTransactionId,
          confirmationNumber: donation.confirmationNumber,
          providerFeeCents: donation.providerFeeCents,
          netAmountReceivedCents: donation.netAmountReceivedCents,
          internalNote: donation.internalNote,
          includeInAnnualStatement: donation.includeInAnnualStatement,
          proofOfPaymentFileName: donation.proofOfPaymentFileName,
          possibleDuplicate: donation.possibleDuplicate,
        }}
        canEdit={canEdit}
        canVoid={canVoid}
        canViewProof={canViewProof}
      />

      <section className="rounded-xl border border-slate-100 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">Activity</h2>
        <ul className="space-y-2 text-xs text-slate-500">
          {donation.auditLogs.map((log) => (
            <li key={log.id} className="flex justify-between">
              <span>
                {log.action.replace(/_/g, " ")}
                {log.toValue ? ` → ${log.toValue}` : ""}
              </span>
              <span>{log.createdAt.toLocaleString()}</span>
            </li>
          ))}
          {donation.auditLogs.length === 0 && <li>No activity yet</li>}
        </ul>
      </section>
    </div>
  );
}
