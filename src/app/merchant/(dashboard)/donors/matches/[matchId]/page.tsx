import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import { formatPersonName } from "@/lib/formatPersonName";
import { loadDonorAggregates } from "@/lib/donors/donorAggregates";
import PossibleMatchActions from "@/components/merchant/PossibleMatchActions";

function Field({ label, existing, candidate, isConflict }: { label: string; existing: string | number | null; candidate: string | number | null; isConflict?: boolean }) {
  return (
    <tr className={isConflict ? "bg-red-50/40" : undefined}>
      <td className="px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</td>
      <td className="px-4 py-2 text-sm text-slate-800">{existing ?? "—"}</td>
      <td className="px-4 py-2 text-sm text-slate-800">{candidate ?? "—"}</td>
    </tr>
  );
}

export default async function PossibleDonorMatchDetailPage({ params }: { params: Promise<{ matchId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/donors");
    throw err;
  }
  const permissions = getDonorPermissions(auth.rawRole);
  if (!permissions.canReviewMatches) redirect("/merchant/donors");

  const { matchId } = await params;
  const match = await prisma.possibleDonorMatch.findFirst({ where: { id: matchId, churchId: auth.churchId } });
  if (!match) notFound();

  const [existingDonor, candidateDonor, existingAggregates, candidateAggregates, candidateExternalDonations, candidateNoteCount] = await Promise.all([
    prisma.donor.findFirst({ where: { id: match.existingDonorId, churchId: auth.churchId } }),
    prisma.donor.findFirst({ where: { id: match.candidateDonorId, churchId: auth.churchId } }),
    loadDonorAggregates(match.existingDonorId, auth.churchId),
    loadDonorAggregates(match.candidateDonorId, auth.churchId),
    prisma.externalDonation.findMany({
      where: { churchId: auth.churchId, donorId: match.candidateDonorId, status: { not: "VOIDED" } },
      orderBy: { donationDate: "desc" },
      take: 20,
    }),
    prisma.donorNote.count({ where: { donorId: match.candidateDonorId, churchId: auth.churchId } }),
  ]);

  if (!existingDonor || !candidateDonor) notFound();

  const conflicting = new Set(match.conflictingFields);

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <Link href="/merchant/donors/matches" className="text-sm text-slate-500 hover:text-slate-700 mb-2 inline-block">
        ← Possible Donor Matches
      </Link>
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Compare possible match</h1>
      <p className="text-sm text-slate-500 mb-6">
        {match.matchReason} — {match.confidence} confidence ({match.confidenceScore}/100)
      </p>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-6">
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Field</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Existing donor</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">New / imported donor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <Field label="Name" existing={formatPersonName(existingDonor.name)} candidate={formatPersonName(candidateDonor.name)} isConflict={conflicting.has("name")} />
            <Field label="Email" existing={existingDonor.email} candidate={candidateDonor.email} />
            <Field label="Phone" existing={existingDonor.phone} candidate={candidateDonor.phone} />
            <Field
              label="Address"
              existing={[existingDonor.addressLine1, existingDonor.city, existingDonor.state, existingDonor.postalCode].filter(Boolean).join(", ") || null}
              candidate={[candidateDonor.addressLine1, candidateDonor.city, candidateDonor.state, candidateDonor.postalCode].filter(Boolean).join(", ") || null}
              isConflict={conflicting.has("address")}
            />
            <Field label="Lifetime total" existing={formatCents(existingAggregates.totalDonatedCents)} candidate={formatCents(candidateAggregates.totalDonatedCents)} />
            <Field label="WGC processed" existing={formatCents(existingAggregates.totalDonatedCents - existingAggregates.externalDonatedCents)} candidate={formatCents(candidateAggregates.totalDonatedCents - candidateAggregates.externalDonatedCents)} />
            <Field label="External donated" existing={formatCents(existingAggregates.externalDonatedCents)} candidate={formatCents(candidateAggregates.externalDonatedCents)} />
            <Field label="Donation count" existing={existingAggregates.donationCount} candidate={candidateAggregates.donationCount} />
            <Field label="Active recurring" existing={existingAggregates.activeSubscriptionCount} candidate={candidateAggregates.activeSubscriptionCount} />
            <Field label="Notes" existing={null} candidate={candidateNoteCount} />
            <Field label="Source identifier" existing={existingDonor.finixIdentityId} candidate={candidateDonor.finixIdentityId} />
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Transactions that would move to the existing donor if confirmed</h2>
        {candidateExternalDonations.length === 0 ? (
          <p className="text-sm text-slate-400">No external donations recorded against the new donor yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-400 uppercase">
              <tr>
                <th className="text-left py-1.5">Date</th>
                <th className="text-left py-1.5">Amount</th>
                <th className="text-left py-1.5">Method</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {candidateExternalDonations.map((d) => (
                <tr key={d.id}>
                  <td className="py-1.5">{new Date(d.donationDate).toLocaleDateString()}</td>
                  <td className="py-1.5">{formatCents(d.donationAmountCents)}</td>
                  <td className="py-1.5">{d.paymentMethod}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <p className="text-xs text-slate-500 mb-3">
          Matched fields: {match.matchedFields.join(", ") || "—"}
          {match.conflictingFields.length > 0 && <span className="text-red-500"> · Conflicting fields: {match.conflictingFields.join(", ")}</span>}
        </p>
        {match.status === "PENDING" ? (
          <PossibleMatchActions matchId={match.id} redirectToListOnResolve />
        ) : (
          <p className="text-sm text-slate-500">
            Already resolved: <span className="font-semibold">{match.status}</span>
            {match.reviewedByEmail ? ` by ${match.reviewedByEmail}` : ""}
          </p>
        )}
      </div>
    </div>
  );
}
