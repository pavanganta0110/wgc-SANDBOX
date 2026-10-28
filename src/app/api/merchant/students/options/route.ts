import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardStudentApi } from "@/lib/students/access";
import { studentDisplayName } from "@/lib/students/constants";

/** Picker data for staff forms (e.g. recording an offline gift): whether the
 * feature is on, the current term, and the active roster. */
export async function GET() {
  const guard = await guardStudentApi({ manage: false, allowDisabled: true });
  if (!guard.ok) return guard.response;
  if (!guard.enabled) return NextResponse.json({ enabled: false, term: null, students: [] });

  const [church, students] = await Promise.all([
    prisma.church.findUnique({ where: { id: guard.auth.churchId }, select: { studentCurrentTerm: true } }),
    prisma.student.findMany({
      where: { churchId: guard.auth.churchId, isActive: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 5000,
    }),
  ]);
  return NextResponse.json({
    enabled: true,
    term: church?.studentCurrentTerm ?? null,
    students: students.map((s) => ({ id: s.id, name: `${studentDisplayName(s)} (${s.studentNumber})` })),
  });
}
