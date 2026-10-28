import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardStudentApi } from "@/lib/students/access";
import { isStudentGivenFor, normalizeTermLabel } from "@/lib/students/constants";

/**
 * Assign or move one gift (online Payment or recorded ExternalDonation) to a
 * student and term. Writes the tag and an append-only audit row together.
 * Only the credit tag changes — the payment's amount/status are untouched.
 */
export async function POST(req: Request) {
  const guard = await guardStudentApi({ manage: true });
  if (!guard.ok) return guard.response;
  const { churchId, userId } = guard.auth;

  const body = await req.json().catch(() => ({}));
  const paymentId = typeof body.paymentId === "string" ? body.paymentId : null;
  const externalDonationId = typeof body.externalDonationId === "string" ? body.externalDonationId : null;
  if (!!paymentId === !!externalDonationId) {
    return NextResponse.json({ error: "Provide exactly one of paymentId or externalDonationId" }, { status: 400 });
  }

  const studentId = typeof body.studentId === "string" && body.studentId ? body.studentId : null;
  const givenFor = body.givenFor;
  if (!isStudentGivenFor(givenFor)) return NextResponse.json({ error: "Invalid gift type" }, { status: 400 });
  if (!studentId && givenFor !== "GENERAL") return NextResponse.json({ error: "Choose a student" }, { status: 400 });
  const termLabel = normalizeTermLabel(body.termLabel);
  if (studentId && !termLabel) return NextResponse.json({ error: "A term is required" }, { status: 400 });

  if (studentId) {
    const student = await prisma.student.findFirst({ where: { id: studentId, churchId }, select: { id: true } });
    if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  const tag = { studentId, studentTermLabel: studentId ? termLabel : null, studentGivenFor: givenFor };

  if (paymentId) {
    const payment = await prisma.payment.findFirst({ where: { id: paymentId, churchId }, select: { id: true, studentId: true } });
    if (!payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    await prisma.$transaction([
      prisma.payment.update({ where: { id: payment.id }, data: tag }),
      prisma.studentAssignmentAudit.create({
        data: { churchId, paymentId: payment.id, fromStudentId: payment.studentId, toStudentId: studentId, termLabel: tag.studentTermLabel, givenFor, actorUserId: userId },
      }),
    ]);
  } else {
    const gift = await prisma.externalDonation.findFirst({ where: { id: externalDonationId as string, churchId }, select: { id: true, studentId: true } });
    if (!gift) return NextResponse.json({ error: "Donation not found" }, { status: 404 });
    await prisma.$transaction([
      prisma.externalDonation.update({ where: { id: gift.id }, data: tag }),
      prisma.studentAssignmentAudit.create({
        data: { churchId, externalDonationId: gift.id, fromStudentId: gift.studentId, toStudentId: studentId, termLabel: tag.studentTermLabel, givenFor, actorUserId: userId },
      }),
    ]);
  }
  return NextResponse.json({ ok: true });
}
