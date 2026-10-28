import Link from "next/link";
import { redirect } from "next/navigation";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import { canManageStudents, canViewStudents } from "@/lib/students/access";
import { loadUnallocatedGifts } from "@/lib/students/ledger";
import { studentDisplayName } from "@/lib/students/constants";
import { AssignGiftControl } from "@/components/merchant/students/StudentActions";

export default async function UnallocatedGiftsPage() {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/dashboard");
    throw err;
  }
  if (!canViewStudents(auth)) redirect("/merchant/dashboard");
  const canManage = canManageStudents(auth);

  const church = await prisma.church.findUnique({ where: { id: auth.churchId }, select: { studentGivingEnabled: true, studentCurrentTerm: true } });
  if (!church?.studentGivingEnabled) redirect("/merchant/students");

  const [gifts, students] = await Promise.all([
    loadUnallocatedGifts(auth.churchId),
    prisma.student.findMany({ where: { churchId: auth.churchId, isActive: true }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
  ]);
  const options = students.map((s) => ({ id: s.id, name: `${studentDisplayName(s)} (${s.studentNumber})` }));

  return (
    <div className="space-y-6">
      <header>
        <Link href="/merchant/students" className="text-xs font-semibold text-indigo-600 hover:underline">← All students</Link>
        <h2 className="mt-1 text-lg font-bold text-slate-900">Unallocated gifts</h2>
        <p className="mt-1 text-sm text-slate-500">
          Gifts to the general scholarship fund that haven&apos;t been assigned to a student yet. Assigning credits them to
          {church.studentCurrentTerm ? ` ${church.studentCurrentTerm}` : " the current term (set it on the Students page first)"}.
        </p>
      </header>

      <div className="overflow-x-auto rounded-2xl border border-slate-200/70 bg-white shadow-sm">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-500">
              <th className="px-5 py-3">Date</th>
              <th className="px-3 py-3">Donor</th>
              <th className="px-3 py-3">Source</th>
              <th className="px-3 py-3 text-right">Amount</th>
              <th className="px-5 py-3 text-right">{canManage ? "Assign" : ""}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {gifts.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-500">Nothing waiting — every general gift has a student.</td></tr>
            )}
            {gifts.map((g) => (
              <tr key={g.key}>
                <td className="px-5 py-3 text-slate-600">{g.date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                <td className="px-3 py-3 font-semibold text-slate-900">{g.donorLabel}</td>
                <td className="px-3 py-3 text-slate-500">{g.source === "ONLINE" ? "Online" : "Recorded offline"}{g.settled ? "" : " · pending"}</td>
                <td className="px-3 py-3 text-right font-bold tabular-nums">{formatCents(g.netCents)}</td>
                <td className="px-5 py-3">
                  {canManage && (
                    <AssignGiftControl
                      gift={{ ...(g.source === "ONLINE" ? { paymentId: g.id } : { externalDonationId: g.id }), currentStudentId: null }}
                      students={options}
                      termLabel={church.studentCurrentTerm}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
