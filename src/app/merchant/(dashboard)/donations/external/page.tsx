import Link from "next/link";
import { redirect } from "next/navigation";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { hasPermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import { EXTERNAL_PAYMENT_METHOD_LABELS, SOURCE_LABELS, receiptStatusLabel, type ExternalPaymentMethod } from "@/lib/donations/externalDonationTypes";
import ExternalDonationRowActions from "@/components/merchant/ExternalDonationRowActions";
import ExternalDonationsFilterBar from "@/components/merchant/ExternalDonationsFilterBar";
import Pagination from "@/components/merchant/Pagination";
import { resolveExternalDonationScopedUserId } from "@/lib/donations/externalDonationScope";
import { loadExternalDonationsList, loadExternalDonationSummary } from "@/lib/donations/externalDonationsList";
import { resolveDateRange } from "@/lib/dateRangePresets";

const PAGE_SIZE = 25;

function SummaryCard({ label, value, sublabel }: { label: string; value: string; sublabel?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-xl font-bold text-slate-900">{value}</p>
      {sublabel && <p className="text-xs text-slate-400 mt-0.5">{sublabel}</p>}
    </div>
  );
}

export default async function ExternalDonationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    method?: string;
    receiptStatus?: string;
    deductible?: string;
    source?: string;
    range?: string;
    from?: string;
    to?: string;
    page?: string;
    unmatched?: string;
  }>;
}) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/dashboard");
    throw err;
  }

  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page || "1", 10) || 1);
  const { from, to } = resolveDateRange(sp.range, sp.from, sp.to);

  // FUNDRAISER/VIEWER without canViewAllTransactions only see donations
  // they personally recorded — same rule as Payments/Donors everywhere else.
  const scopedUserId = await resolveExternalDonationScopedUserId(auth);

  const filters = {
    search: sp.q,
    paymentMethod: sp.method,
    receiptStatus: sp.receiptStatus,
    isTaxDeductible: sp.deductible === "yes" ? true : sp.deductible === "no" ? false : undefined,
    importedOnly: sp.source === "imported",
    manualOnly: sp.source === "manual",
    donationDateFrom: from || undefined,
    donationDateTo: to || undefined,
    scopedToUserId: scopedUserId || undefined,
  };

  const [{ rows: donations, totalCount }, summary, unmatched] = await Promise.all([
    loadExternalDonationsList(auth.churchId, filters, page, PAGE_SIZE),
    loadExternalDonationSummary(auth.churchId, filters),
    prisma.externalDonation.findMany({
      where: { churchId: auth.churchId, donorMatchStatus: "UNMATCHED", status: { not: "VOIDED" }, ...(scopedUserId ? { createdByUserId: scopedUserId } : {}) },
      orderBy: { donationDate: "desc" },
      take: 25,
    }),
  ]);

  const donorIds = [...new Set([...donations, ...unmatched].map((d) => d.donorId).filter((id): id is string => Boolean(id)))];
  const userIds = [...new Set(donations.map((d) => d.createdByUserId).filter((id): id is string => Boolean(id)))];
  const [donorRows, userRows] = await Promise.all([
    donorIds.length ? prisma.donor.findMany({ where: { id: { in: donorIds } }, select: { id: true, name: true, email: true } }) : [],
    userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } }) : [],
  ]);
  const donorById = new Map(donorRows.map((d) => [d.id, d]));
  const userById = new Map(userRows.map((u) => [u.id, u]));

  const canCreate = hasPermission(auth, "canCreateExternalDonation");
  const canImport = hasPermission(auth, "canImportExternalDonations");
  const canExport = hasPermission(auth, "canExportExternalDonations");
  const canVoid = hasPermission(auth, "canVoidExternalDonation");
  const canSendReceipt = hasPermission(auth, "canSendExternalDonationReceipt");
  const canMatch = hasPermission(auth, "canMatchExternalDonationToDonor");

  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="p-6 md:p-8 space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">External Donations</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Donations your organization received outside WGC Payments — cash, check, Zelle, Venmo, Cash App, PayPal, bank transfer, or another
            offline method. These records are never processed by Finix and are excluded from processing volume, settlements, deposits, and fee
            totals, but they still count toward donor totals, year-end statements, and your own reports.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canImport && (
            <Link href="/merchant/donations/external/import/history" className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Import History
            </Link>
          )}
          {canImport && (
            <Link href="/merchant/donations/external/import" className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Import Donations
            </Link>
          )}
          {canCreate && (
            <Link href="/merchant/donations/external/new" className="rounded-lg bg-[#010409] px-4 py-2.5 text-sm font-semibold text-white">
              Add External Donation
            </Link>
          )}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard label="Total external donations" value={formatCents(summary.totalAmountCents)} sublabel={`${summary.totalCount} donation${summary.totalCount === 1 ? "" : "s"}`} />
        <SummaryCard label="Receipts sent" value={String(summary.receiptSent)} />
        <SummaryCard label="Receipts not sent" value={String(summary.receiptNotSent)} />
        <SummaryCard label="Receipts failed" value={String(summary.receiptFailed)} />
      </div>

      <ExternalDonationsFilterBar canExport={canExport} />

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
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="text-left px-5 py-3">Donor</th>
                <th className="text-right px-5 py-3">Amount</th>
                <th className="text-left px-5 py-3">Date</th>
                <th className="text-left px-5 py-3">Method</th>
                <th className="text-left px-5 py-3">Fund / Purpose</th>
                <th className="text-left px-5 py-3">Receipt</th>
                <th className="text-left px-5 py-3">Deductible</th>
                <th className="text-left px-5 py-3">Added by</th>
                <th className="text-left px-5 py-3">Entered</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {donations.map((d) => {
                const donor = d.donorId ? donorById.get(d.donorId) : null;
                const addedBy = d.createdByUserId ? userById.get(d.createdByUserId) : null;
                return (
                  <tr key={d.id} className={d.status === "VOIDED" ? "opacity-50" : ""}>
                    <td className="px-5 py-3">
                      <Link href={`/merchant/donations/external/${d.id}`} className="text-blue-600 hover:underline font-medium">
                        {d.isAnonymous ? "Anonymous" : donor?.name || (d.donorMatchStatus === "UNMATCHED" ? <span className="text-amber-600">Unmatched</span> : "—")}
                      </Link>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">External / Offline</span>
                        {d.importBatchId && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">Imported</span>}
                        {d.possibleDuplicate && <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">Possible duplicate</span>}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right font-semibold whitespace-nowrap">{formatCents(d.donationAmountCents)}</td>
                    <td className="px-5 py-3 whitespace-nowrap">{d.donationDate.toLocaleDateString()}</td>
                    <td className="px-5 py-3 whitespace-nowrap">{d.paymentMethod === "OTHER" ? d.otherPaymentMethodName : EXTERNAL_PAYMENT_METHOD_LABELS[d.paymentMethod as ExternalPaymentMethod]}</td>
                    <td className="px-5 py-3 text-slate-500">{d.fundName || SOURCE_LABELS[d.source as keyof typeof SOURCE_LABELS] || "—"}</td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{receiptStatusLabel(d.receiptStatus)}</span>
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">{d.isTaxDeductible ? "Yes" : "No"}</td>
                    <td className="px-5 py-3 text-slate-500 whitespace-nowrap">{addedBy?.email || "—"}</td>
                    <td className="px-5 py-3 text-slate-500 whitespace-nowrap">{d.createdAt.toLocaleDateString()}</td>
                    <td className="px-5 py-3">
                      <ExternalDonationRowActions
                        id={d.id}
                        status={d.status}
                        donorMatchStatus={d.donorMatchStatus}
                        canVoid={canVoid}
                        canSendReceipt={canSendReceipt}
                        canMatch={canMatch}
                        hasDonorEmail={Boolean(donor?.email)}
                        receiptAlreadySent={Boolean(d.receiptSentAt)}
                      />
                    </td>
                  </tr>
                );
              })}
              {donations.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-5 py-10 text-center text-sm text-slate-400">
                    {totalCount === 0 ? "No external donations recorded yet." : "No donations match these filters."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageCount={pageCount} total={totalCount} pageSize={PAGE_SIZE} />
      </section>
    </div>
  );
}
