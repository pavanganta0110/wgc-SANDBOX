import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardStudentApi } from "@/lib/students/access";
import { normalizeTermLabel } from "@/lib/students/constants";
import { parseDollarsToCents } from "@/lib/students/importPlan";

/** Edit a student's details, active flag, or set/replace the charge for a term. */
export async function PATCH(req: Request, { params }: { params: Promise<{ studentId: string }> }) {
  const guard = await guardStudentApi({ manage: true });
  if (!guard.ok) return guard.response;
  const { churchId } = guard.auth;
  const { studentId } = await params;

  const student = await prisma.student.findFirst({ where: { id: studentId, churchId } });
  if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.firstName === "string") data.firstName = body.firstName.trim();
  if (typeof body.lastName === "string") data.lastName = body.lastName.trim();
  if (typeof body.isActive === "boolean") data.isActive = body.isActive;
  if (body.email !== undefined) {
    const email = typeof body.email === "string" && body.email.trim() ? body.email.trim() : null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    data.email = email;
  }
  if (Object.keys(data).length > 0) await prisma.student.update({ where: { id: student.id }, data });

  if (body.charge !== undefined) {
    const termLabel = normalizeTermLabel(body.termLabel);
    const cents = parseDollarsToCents(String(body.charge));
    if (!termLabel || cents == null) return NextResponse.json({ error: "A term and a valid charge are required" }, { status: 400 });
    await prisma.studentTermCharge.upsert({
      where: { studentId_termLabel: { studentId: student.id, termLabel } },
      create: { churchId, studentId: student.id, termLabel, amountCents: cents, source: "MANUAL" },
      update: { amountCents: cents, source: "MANUAL" },
    });
  }
  return NextResponse.json({ ok: true });
}
