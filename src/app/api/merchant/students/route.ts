import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { guardStudentApi } from "@/lib/students/access";
import { normalizeTermLabel } from "@/lib/students/constants";
import { parseDollarsToCents } from "@/lib/students/importPlan";

/** Add one student, optionally with a charge for a term. */
export async function POST(req: Request) {
  const guard = await guardStudentApi({ manage: true });
  if (!guard.ok) return guard.response;
  const { churchId } = guard.auth;

  const body = await req.json().catch(() => ({}));
  const studentNumber = typeof body.studentNumber === "string" ? body.studentNumber.trim() : "";
  const firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
  const lastName = typeof body.lastName === "string" ? body.lastName.trim() : "";
  const email = typeof body.email === "string" && body.email.trim() ? body.email.trim() : null;
  if (!studentNumber || (!firstName && !lastName)) {
    return NextResponse.json({ error: "Student ID and a name are required" }, { status: 400 });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }
  const termLabel = normalizeTermLabel(body.termLabel);
  const chargeCents = body.charge != null && body.charge !== "" ? parseDollarsToCents(String(body.charge)) : null;
  if (body.charge != null && body.charge !== "" && chargeCents == null) {
    return NextResponse.json({ error: "Invalid charge amount" }, { status: 400 });
  }
  if (chargeCents != null && !termLabel) return NextResponse.json({ error: "A term is required with a charge" }, { status: 400 });

  try {
    const student = await prisma.student.create({ data: { churchId, studentNumber, firstName, lastName, email } });
    if (chargeCents != null && termLabel) {
      await prisma.studentTermCharge.create({
        data: { churchId, studentId: student.id, termLabel, amountCents: chargeCents, source: "MANUAL" },
      });
    }
    return NextResponse.json({ student }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "A student with this ID already exists" }, { status: 409 });
    }
    throw err;
  }
}
