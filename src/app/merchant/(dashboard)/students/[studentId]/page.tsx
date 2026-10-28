import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import { canManageStudents, canViewStudents } from "@/lib/students/access";
import { loadKnownTerms, loadStudentGifts } from "@/lib/students/ledger";
import {
  STUDENT_GIVEN_FOR_LABEL,
  computeStudentStatus,
  isStudentGivenFor,
  normalizeTermLabel,
  studentDisplayName,
} from "@/lib/students/constants";
import TakePaymentAction from "@/components/merchant/dashboard/TakePaymentAction";
import SummaryStrip from "@/components/merchant/reporting/ui/SummaryStrip";
import StatusBadge from "@/components/merchant/students/StatusBadge";
import { SetChargeForm, StudentGivingLinkButton } from "@/components/merchant/students/StudentActions";

export default async function StudentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ term?: string }>;
}) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/dashboard");
    throw err;
  }
  if (!canViewStudents(auth)) redirect("/merchant/dashboard");
  const canManage = canManageStudents(auth);

  const { studentId } = await params;
  const church = await prisma.church.findUnique({ where: { id: auth.churchId }, select: { studentGivingEnabled: true, studentCurrentTerm: true, name: true, finixMerchantId: true } });
  if (!church?.studentGivingEnabled) redirect("/merchant/students");
  const student = await prisma.student.findFirst({ where: { id: studentId, churchId: auth.churchId } });
  if (!student) notFound();

  const sp = await searchParams;
  const pricing = await prisma.churchPricing.findUnique({ where: { churchId: auth.churchId } });
  const canTakePayment = auth.role !== "viewer" && !!church.finixMerchantId && student.isActive;
  const terms = await loadKnownTerms(auth.churchId);
  const term = normalizeTermLabel(sp.term) ?? church.studentCurrentTerm ?? terms[0] ?? null;

  const [charge, gifts, audit] = await Promise.all([
    term ? prisma.studentTermCharge.findUnique({ where: { studentId_termLabel: { studentId: student.id, termLabel: term } } }) : null,
    loadStudentGifts({ churchId: auth.churchId, studentId: student.id, termLabel: term }),
    prisma.studentAssignmentAudit.findMany({
      where: { churchId: auth.churchId, OR: [{ fromStudentId: student.id }, { toStudentId: student.id }] },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const credited = gifts.filter((g) => g.settled).reduce((s, g) => s + g.netCents, 0);
  const pending = gifts.filter((g) => !g.settled).reduce((s, g) => s + g.netCents, 0);
  const chargeCents = charge?.amountCents ?? null;
  const status = computeStudentStatus(chargeCents, credited);
  const name = studentDisplayName(student);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link href={term ? `/merchant/students?term=${encodeURIComponent(term)}` : "/merchant/students"} className="text-xs font-semibold text-indigo-600 hover:underline">
            ← All students
          </Link>
          <div className="mt-1 flex items-center gap-3">
            <h2 className="text-lg font-bold text-slate-900">{name}</h2>
            <StatusBadge status={status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            ID {student.studentNumber}
            {student.email ? ` · ${student.email}` : ""}
            {term ? ` · ${term}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canTakePayment && (
            <TakePaymentAction
              finixMerchantId={church.finixMerchantId as string}
              churchName={church.name}
              pricing={{ cardPercentageFee: pricing?.cardPercentageFee ?? null, cardFixedFeeCents: pricing?.cardFixedFeeCents ?? null, achFixedFeeCents: pricing?.achFixedFeeCents ?? null }}
              initialStudent={{ id: student.id, name: `${name} (${student.studentNumber})` }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Take payment for {student.firstName}
            </TakePaymentAction>
          )}
          {canManage && student.isActive && <StudentGivingLinkButton studentId={student.id} termLabel={term} />}
        </div>
      </header>

      <nav aria-label="Term" className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-0.5 w-fit">
        {terms.map((t) => (
          <Link
            key={t}
            href={`/merchant/students/${student.id}?term=${encodeURIComponent(t)}`}
            aria-current={t === term ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${t === term ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
          >
            {t}
          </Link>
        ))}
      </nav>

      <SummaryStrip
        items={[
          { label: "Charge", value: chargeCents == null ? "—" : formatCents(chargeCents) },
          { label: "Credited", value: formatCents(credited), hint: "Settled, net of refunds" },
          { label: "Pending", value: pending ? formatCents(pending) : "—" },
          { label: "Balance", value: chargeCents == null ? "—" : formatCents(chargeCents - credited) },
        ]}
      />
      {canManage && term && <SetChargeForm studentId={student.id} termLabel={term} />}

      <div className="overflow-x-auto rounded-2xl border border-slate-200/70 bg-white shadow-sm">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-500">
              <th className="px-5 py-3">Date</th>
              <th className="px-3 py-3">Donor</th>
              <th className="px-3 py-3">Type</th>
              <th className="px-3 py-3">Source</th>
              <th className="px-3 py-3 text-right">Gift</th>
              <th className="px-5 py-3 text-right">Credited</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {gifts.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-slate-500">No gifts credited to this student{term ? ` for ${term}` : ""} yet.</td>
              </tr>
            )}
            {gifts.map((g) => (
              <tr key={g.key}>
                <td className="px-5 py-3 text-slate-600">{g.date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                <td className="px-3 py-3 font-semibold text-slate-900">
                  {g.donorId ? <Link href={`/merchant/donors/${g.donorId}`} className="hover:text-indigo-600">{g.donorLabel}</Link> : g.donorLabel}
                </td>
                <td className="px-3 py-3">{isStudentGivenFor(g.givenFor) ? STUDENT_GIVEN_FOR_LABEL[g.givenFor] : "—"}</td>
                <td className="px-3 py-3 text-slate-500">{g.source === "ONLINE" ? "Online" : "Recorded offline"}</td>
                <td className="px-3 py-3 text-right tabular-nums">{formatCents(g.grossCents)}</td>
                <td className="px-5 py-3 text-right font-bold tabular-nums">
                  {g.settled ? formatCents(g.netCents) : <span className="font-medium text-amber-600">Pending</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {audit.length > 0 && (
        <section>
          <h3 className="text-sm font-bold text-slate-900">Assignment history</h3>
          <ul className="mt-2 space-y-1 text-xs text-slate-500">
            {audit.map((a) => (
              <li key={a.id}>
                {a.createdAt.toLocaleString("en-US")} — {a.toStudentId === student.id ? "assigned to" : "moved away from"} this student
                {a.termLabel ? ` (${a.termLabel})` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
