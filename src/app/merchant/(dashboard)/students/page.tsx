import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, CircleDollarSign, GraduationCap, Users } from "lucide-react";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import { canManageStudents, canViewStudents } from "@/lib/students/access";
import { loadKnownTerms, loadTermLedger } from "@/lib/students/ledger";
import { normalizeTermLabel } from "@/lib/students/constants";
import { STUDENT_FILTERS, resolveStudentFilter } from "@/lib/students/filters";
import SummaryStrip from "@/components/merchant/reporting/ui/SummaryStrip";
import StatusBadge from "@/components/merchant/students/StatusBadge";
import TakePaymentAction from "@/components/merchant/dashboard/TakePaymentAction";
import DownloadMenu from "@/components/merchant/students/DownloadMenu";
import { AddStudentButton, CollegeGivingLinkButton, CurrentTermForm, EnableStudentGivingCard, ImportStudentsButton } from "@/components/merchant/students/StudentActions";

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ term?: string; filter?: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/dashboard");
    throw err;
  }
  if (!canViewStudents(auth)) redirect("/merchant/dashboard");
  const canManage = canManageStudents(auth);

  const church = await prisma.church.findUnique({
    where: { id: auth.churchId },
    select: { studentGivingEnabled: true, studentCurrentTerm: true, name: true, finixMerchantId: true },
  });
  if (!church?.studentGivingEnabled) return <EnableStudentGivingCard canManage={canManage} />;

  const sp = await searchParams;
  const pricing = await prisma.churchPricing.findUnique({ where: { churchId: auth.churchId } });
  const canTakePayment = auth.role !== "viewer" && !!church.finixMerchantId;
  const terms = await loadKnownTerms(auth.churchId);
  const term = normalizeTermLabel(sp.term) ?? church.studentCurrentTerm ?? terms[0] ?? null;
  const all = await loadTermLedger({ churchId: auth.churchId, termLabel: term });
  const activeFilter = resolveStudentFilter(sp.filter);
  const rows = all.filter(activeFilter.test);

  const withCharge = all.filter((r) => r.chargeCents != null);
  const fully = all.filter((r) => r.status === "FULLY_CREDITED" || r.status === "OVER_FUNDED").length;
  const totalCharge = withCharge.reduce((s, r) => s + (r.chargeCents ?? 0), 0);
  const totalCredited = all.reduce((s, r) => s + r.creditedCents, 0);
  const termHref = (t: string, extra = "") => `/merchant/students?term=${encodeURIComponent(t)}${extra}`;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Students</h2>
          <p className="mt-1 text-sm text-slate-500">Who is fully credited for the term, and who gave toward each student.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {term && (
            <DownloadMenu
              term={term}
              filterKey={activeFilter.key}
              filterLabel={activeFilter.label}
              count={rows.length}
            />
          )}
          {canTakePayment && (
            <TakePaymentAction
              finixMerchantId={church.finixMerchantId as string}
              churchName={church.name}
              pricing={{ cardPercentageFee: pricing?.cardPercentageFee ?? null, cardFixedFeeCents: pricing?.cardFixedFeeCents ?? null, achFixedFeeCents: pricing?.achFixedFeeCents ?? null }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Take payment
            </TakePaymentAction>
          )}
          {canManage && <CollegeGivingLinkButton />}
          {canManage && <ImportStudentsButton defaultTerm={term} />}
          {canManage && <AddStudentButton defaultTerm={term} />}
        </div>
      </header>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <nav aria-label="Term" className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-0.5">
          {terms.length === 0 && <span className="px-3 py-1.5 text-xs text-slate-500">No terms yet — import charges to create one.</span>}
          {terms.map((t) => (
            <Link
              key={t}
              href={termHref(t)}
              aria-current={t === term ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${t === term ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
            >
              {t}
            </Link>
          ))}
        </nav>
        <div className="flex items-end gap-4">
          <Link href="/merchant/students/unallocated" className="text-sm font-semibold text-indigo-600 hover:underline">
            Unallocated gifts
          </Link>
          {canManage && <CurrentTermForm currentTerm={church.studentCurrentTerm} />}
        </div>
      </div>

      <SummaryStrip
        items={[
          { label: "Students", value: all.length.toLocaleString("en-US"), icon: <Users className="h-4 w-4" /> },
          { label: "Fully credited", value: `${fully} of ${withCharge.length}`, icon: <CheckCircle2 className="h-4 w-4" />, hint: "With a charge this term" },
          { label: "Charged", value: formatCents(totalCharge), icon: <GraduationCap className="h-4 w-4" /> },
          { label: "Credited", value: formatCents(totalCredited), icon: <CircleDollarSign className="h-4 w-4" />, hint: "Settled gifts, net of refunds" },
        ]}
      />

      <div className="flex flex-wrap gap-2 text-xs font-semibold">
        {STUDENT_FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/merchant/students?${term ? `term=${encodeURIComponent(term)}&` : ""}filter=${f.key}`}
            className={`rounded-lg px-3 py-1.5 ${f.key === activeFilter.key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
          >
            {f.label} <span className="opacity-70">{all.filter(f.test).length}</span>
          </Link>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200/70 bg-white shadow-sm">
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-500">
              <th className="px-5 py-3">Student</th>
              <th className="px-3 py-3">ID</th>
              <th className="px-3 py-3 text-right">Charge</th>
              <th className="px-3 py-3 text-right">Credited</th>
              <th className="px-3 py-3 text-right">From sponsors</th>
              <th className="px-3 py-3 text-right">Self-paid</th>
              <th className="px-3 py-3 text-right">Pending</th>
              <th className="px-3 py-3 text-right">Balance</th>
              <th className="px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-5 py-10 text-center text-slate-500">
                  {all.length === 0 ? "No students yet. Import a roster CSV or add a student." : "Nobody matches this filter."}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.studentId} className={r.isActive ? undefined : "bg-slate-50/60"}>
                <td className="px-5 py-3">
                  <Link href={`/merchant/students/${r.studentId}${term ? `?term=${encodeURIComponent(term)}` : ""}`} className="font-semibold text-slate-900 hover:text-indigo-600">
                    {r.name}
                  </Link>
                  {!r.isActive && <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600">Inactive</span>}
                </td>
                <td className="px-3 py-3 text-slate-500">{r.studentNumber}</td>
                <td className="px-3 py-3 text-right tabular-nums">{r.chargeCents == null ? "—" : formatCents(r.chargeCents)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{formatCents(r.creditedCents)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-slate-700">
                  {r.sponsorCents ? formatCents(r.sponsorCents) : "—"}
                  {r.sponsorCount > 0 && <span className="block text-[11px] text-slate-400">{r.sponsorCount} {r.sponsorCount === 1 ? "sponsor" : "sponsors"}</span>}
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-slate-700">{r.selfCents ? formatCents(r.selfCents) : "—"}</td>
                <td className="px-3 py-3 text-right tabular-nums text-slate-500">{r.pendingCents ? formatCents(r.pendingCents) : "—"}</td>
                <td className="px-3 py-3 text-right font-bold tabular-nums text-slate-900">{r.balanceCents == null ? "—" : formatCents(r.balanceCents)}</td>
                <td className="px-5 py-3"><StatusBadge status={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        Credited counts settled gifts only, net of refunds and bank returns. Pending gifts (e.g. bank transfers in progress) are shown separately.
      </p>
    </div>
  );
}
