import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { guardStudentApi } from "@/lib/students/access";
import { buildCsvExport, csvResponse } from "@/lib/csvExport";
import { loadTermGiftLines, loadTermLedger } from "@/lib/students/ledger";
import { STUDENT_GIVEN_FOR_LABEL, STUDENT_STATUS_LABEL, isStudentGivenFor, normalizeTermLabel } from "@/lib/students/constants";
import { resolveStudentFilter } from "@/lib/students/filters";
import StudentLedgerPdf from "@/lib/students/StudentLedgerPdf";

const dollars = (cents: number | null) => (cents == null ? "" : (cents / 100).toFixed(2));

/**
 * GET ?term=Fall%202026&type=ledger|gifts&filter=full|partial|none|sponsored|self&format=csv|pdf
 *
 * Downloads exactly what the Students page shows for that term and filter, so
 * a finance user can pick "Didn't pay" and download just those students.
 * `ledger` = one row per student; `gifts` = one row per gift for the students
 * in the filter (CSV only); `format=pdf` is available for `ledger`.
 */
export async function GET(req: Request) {
  const guard = await guardStudentApi({ manage: false });
  if (!guard.ok) return guard.response;
  const { churchId } = guard.auth;

  const url = new URL(req.url);
  const term = normalizeTermLabel(url.searchParams.get("term"));
  if (!term) return NextResponse.json({ error: "A term is required" }, { status: 400 });
  const filter = resolveStudentFilter(url.searchParams.get("filter"));
  const wantsGifts = url.searchParams.get("type") === "gifts";
  const wantsPdf = url.searchParams.get("format") === "pdf";
  if (wantsGifts && wantsPdf) return NextResponse.json({ error: "The gift list is available as CSV only" }, { status: 400 });

  const slug = (v: string) => v.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const base = `${wantsGifts ? "student-gifts" : "student-ledger"}-${slug(term)}${filter.key === "all" ? "" : `-${filter.key}`}`;

  const rows = (await loadTermLedger({ churchId, termLabel: term })).filter(filter.test);

  if (wantsGifts) {
    const students = await prisma.student.findMany({ where: { churchId } });
    const byId = new Map(students.map((s) => [s.id, s]));
    const included = new Set(rows.map((r) => r.studentId));
    const gifts = (await loadTermGiftLines(churchId, term)).filter((g) => g.studentId && included.has(g.studentId));
    const csv = buildCsvExport(gifts, [
      { header: "Student ID", value: (g) => byId.get(g.studentId ?? "")?.studentNumber ?? "" },
      { header: "Student Name", value: (g) => { const s = byId.get(g.studentId ?? ""); return s ? `${s.firstName} ${s.lastName}`.trim() : ""; } },
      { header: "Term", value: () => term },
      { header: "Donor", value: (g) => g.donorLabel },
      { header: "Date", value: (g) => g.date.toISOString().slice(0, 10) },
      { header: "Gift Type", value: (g) => (isStudentGivenFor(g.givenFor) ? STUDENT_GIVEN_FOR_LABEL[g.givenFor] : "") },
      { header: "Source", value: (g) => (g.source === "ONLINE" ? "Online" : "Recorded offline") },
      { header: "Method", value: (g) => g.method },
      { header: "Gross Amount", value: (g) => dollars(g.grossCents) },
      { header: "Credited Amount", value: (g) => dollars(g.settled ? g.netCents : 0) },
      { header: "Status", value: (g) => (g.settled ? "Settled" : "Pending") },
    ]);
    return csvResponse(csv, `${base}.csv`);
  }

  if (wantsPdf) {
    const church = await prisma.church.findUnique({ where: { id: churchId }, select: { name: true } });
    const pdf = await renderToBuffer(
      StudentLedgerPdf({
        organizationName: church?.name ?? "Organization",
        termLabel: term,
        filterLabel: filter.label,
        rows,
        generatedAt: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      }),
    );
    return new NextResponse(new Uint8Array(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${base}.pdf"` },
    });
  }

  const csv = buildCsvExport(rows, [
    { header: "Student ID", value: (r) => r.studentNumber },
    { header: "Student Name", value: (r) => r.name },
    { header: "Term", value: () => term },
    { header: "Charge", value: (r) => dollars(r.chargeCents) },
    { header: "Credited", value: (r) => dollars(r.creditedCents) },
    { header: "From Sponsors", value: (r) => dollars(r.sponsorCents) },
    { header: "Self-paid", value: (r) => dollars(r.selfCents) },
    { header: "Sponsors", value: (r) => String(r.sponsorCount) },
    { header: "Pending", value: (r) => dollars(r.pendingCents) },
    { header: "Balance", value: (r) => dollars(r.balanceCents) },
    { header: "Status", value: (r) => STUDENT_STATUS_LABEL[r.status] },
    { header: "Gifts", value: (r) => String(r.giftCount) },
  ]);
  return csvResponse(csv, `${base}.csv`);
}
