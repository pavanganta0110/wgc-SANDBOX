import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardStudentApi } from "@/lib/students/access";
import { normalizeTermLabel } from "@/lib/students/constants";
import { generatePublicSlug } from "@/lib/givingLinks/validation";
import { DEFAULT_DONOR_FIELD_SETTINGS } from "@/lib/givingLinks/types";
import { resolveGivingLinkOwnerForCreate } from "@/lib/auth/givingLinkOwnership";
import { isAuthError } from "@/lib/auth/errors";

/**
 * Create (or return the existing) per-student giving link. The student and
 * term are fixed on the link and enforced server-side at donate time, so a
 * donor can't redirect the gift to a different student.
 */
export async function POST(req: Request, { params }: { params: Promise<{ studentId: string }> }) {
  const guard = await guardStudentApi({ manage: true });
  if (!guard.ok) return guard.response;
  const { auth } = guard;
  const { studentId } = await params;

  const student = await prisma.student.findFirst({ where: { id: studentId, churchId: auth.churchId, isActive: true } });
  if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });

  const church = await prisma.church.findUnique({
    where: { id: auth.churchId },
    select: { studentCurrentTerm: true, defaultCollectMailingAddressOnNewLinks: true },
  });
  const body = await req.json().catch(() => ({}));
  const termLabel = normalizeTermLabel(body.termLabel) ?? church?.studentCurrentTerm ?? null;
  if (!termLabel) return NextResponse.json({ error: "Set the current term first" }, { status: 400 });

  const existing = await prisma.givingLink.findFirst({
    where: { churchId: auth.churchId, studentId: student.id, studentTermLabel: termLabel, status: "ACTIVE" },
  });
  if (existing) return NextResponse.json({ link: existing, created: false });

  let ownerUserId: string;
  try {
    ownerUserId = await resolveGivingLinkOwnerForCreate(auth, undefined);
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  let publicSlug = generatePublicSlug();
  for (let attempt = 0; attempt < 5; attempt++) {
    if (!(await prisma.givingLink.findUnique({ where: { publicSlug } }))) break;
    publicSlug = generatePublicSlug();
  }

  const name = `${student.firstName} ${student.lastName}`.trim();
  const link = await prisma.givingLink.create({
    data: {
      churchId: auth.churchId,
      publicSlug,
      internalName: `Student: ${name} (${termLabel})`,
      publicTitle: `Give toward ${name}`,
      description: `Support ${name}'s ${termLabel} tuition.`,
      status: "ACTIVE",
      amountType: "VARIABLE",
      minAmountCents: 100,
      suggestedAmountsJson: [5000, 10000, 25000, 50000],
      allowCustomAmount: true,
      linkType: "MULTI_USE",
      recurringEnabled: true,
      allowedFrequenciesJson: ["MONTHLY"],
      defaultDonationType: "ONE_TIME",
      allowedPaymentMethodsJson: ["CARD", "BANK"],
      donorFieldSettingsJson: DEFAULT_DONOR_FIELD_SETTINGS,
      collectMailingAddress: church?.defaultCollectMailingAddressOnNewLinks ?? true,
      feeCoverEnabled: true,
      feeCoverDefaultOn: true,
      studentId: student.id,
      studentTermLabel: termLabel,
      createdByUserId: auth.userId,
      ownerUserId,
    },
  });
  return NextResponse.json({ link, created: true }, { status: 201 });
}
