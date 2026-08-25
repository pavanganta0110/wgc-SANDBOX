import Link from "next/link";
import { redirect } from "next/navigation";
import { formatCalendarDateUTC } from "@/lib/formatDateTimeCDT";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import { formatPersonName } from "@/lib/formatPersonName";
import PossibleMatchActions from "@/components/merchant/PossibleMatchActions";

const CONFIDENCE_STYLES: Record<string, string> = {
  HIGH: "bg-emerald-50 text-emerald-700",
  MEDIUM: "bg-amber-50 text-amber-700",
  LOW: "bg-slate-100 text-slate-600",
};

export default async function PossibleDonorMatchesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/donors");
    throw err;
  }
  const permissions = getDonorPermissions(auth.rawRole);
  if (!permissions.canReviewMatches) redirect("/merchant/donors");

  const sp = await searchParams;
  const status = sp.status || "PENDING";

  const matches = await prisma.possibleDonorMatch.findMany({
    where: { churchId: auth.churchId, status },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const donorIds = [...new Set(matches.flatMap((m) => [m.existingDonorId, m.candidateDonorId]))];
  const donors = donorIds.length ? await prisma.donor.findMany({ where: { id: { in: donorIds }, churchId: auth.churchId } }) : [];
  const donorMap = new Map(donors.map((d) => [d.id, d]));

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <Link href="/merchant/donors" className="text-sm text-slate-500 hover:text-slate-700 mb-2 inline-block">
        ← Donors
      </Link>
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Possible Donor Matches</h1>
      <p className="text-sm text-slate-500 mb-6">
        When a newly-entered or imported donor closely resembles an existing donor but doesn&apos;t exactly match on email, phone, or a linked
        payment identity, it shows up here for a human decision — donors are never automatically merged on name similarity alone.
      </p>

      <div className="flex items-center gap-2 mb-4 text-sm">
        {["PENDING", "CONFIRMED", "REJECTED", "SKIPPED"].map((s) => (
          <Link
            key={s}
            href={`/merchant/donors/matches?status=${s}`}
            className={`px-3 py-1.5 rounded-full font-semibold ${status === s ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}
          >
            {s.charAt(0) + s.slice(1).toLowerCase()}
          </Link>
        ))}
      </div>

      <div className="space-y-3">
        {matches.map((m) => {
          const existing = donorMap.get(m.existingDonorId);
          const candidate = donorMap.get(m.candidateDonorId);
          return (
            <div key={m.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${CONFIDENCE_STYLES[m.confidence] ?? "bg-slate-100 text-slate-600"}`}>
                    {m.confidence} confidence ({m.confidenceScore})
                  </span>
                  <p className="text-sm text-slate-500 mt-1">{m.matchReason}</p>
                </div>
                <Link href={`/merchant/donors/matches/${m.id}`} className="text-sm text-blue-600 hover:underline font-medium whitespace-nowrap">
                  Compare side by side →
                </Link>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="rounded-xl border border-slate-100 p-3">
                  <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Existing donor</p>
                  <p className="font-semibold text-slate-800">{formatPersonName(existing?.name)}</p>
                  <p className="text-xs text-slate-500">{existing?.email || "—"} · {existing?.phone || "—"}</p>
                </div>
                <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-3">
                  <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">New / imported donor</p>
                  <p className="font-semibold text-slate-800">{formatPersonName(candidate?.name)}</p>
                  <p className="text-xs text-slate-500">{candidate?.email || "—"} · {candidate?.phone || "—"}</p>
                  {m.donationAmountCents != null && (
                    <p className="text-xs text-slate-500 mt-1">{formatCents(m.donationAmountCents)} on {m.donationDate ? formatCalendarDateUTC(m.donationDate) : "—"}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-400">
                  Matched on: {m.matchedFields.join(", ") || "—"}
                  {m.conflictingFields.length > 0 && <span className="text-red-400"> · Conflicts: {m.conflictingFields.join(", ")}</span>}
                </p>
                {status === "PENDING" ? (
                  <PossibleMatchActions matchId={m.id} />
                ) : (
                  <p className="text-xs text-slate-400">
                    {m.reviewedByEmail ? `Reviewed by ${m.reviewedByEmail}` : ""} {m.reviewedAt ? new Date(m.reviewedAt).toLocaleString() : ""}
                  </p>
                )}
              </div>
            </div>
          );
        })}
        {matches.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 text-center text-slate-400">
            No {status.toLowerCase()} possible matches.
          </div>
        )}
      </div>
    </div>
  );
}
