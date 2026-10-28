import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardStudentApi } from "@/lib/students/access";
import { generatePublicSlug } from "@/lib/givingLinks/validation";
import { DEFAULT_DONOR_FIELD_SETTINGS } from "@/lib/givingLinks/types";
import { resolveGivingLinkOwnerForCreate } from "@/lib/auth/givingLinkOwnership";
import { isAuthError } from "@/lib/auth/errors";

/**
 * The organization's one giving link where donors search for any student
 * ("Who is this gift for?"). Idempotent: returns the existing active link if
 * there is one, otherwise creates it. It is an ordinary giving link, so it
 * also appears under Giving Links where it can be edited and previewed.
 */
export async function POST() {
  const guard = await guardStudentApi({ manage: true });
  if (!guard.ok) return guard.response;
  const { auth } = guard;

  const existing = await prisma.givingLink.findFirst({
    where: { churchId: auth.churchId, studentSelectionEnabled: true, studentId: null, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return NextResponse.json({ link: existing, created: false });

  const church = await prisma.church.findUnique({
    where: { id: auth.churchId },
    select: { name: true, defaultCollectMailingAddressOnNewLinks: true },
  });
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

  const link = await prisma.givingLink.create({
    data: {
      churchId: auth.churchId,
      publicSlug,
      internalName: "Student Giving — all students",
      publicTitle: "Support a student",
      description: `Give toward a student's tuition at ${church?.name ?? "our school"}. Search for the student by name, or give to the general scholarship fund.`,
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
      studentSelectionEnabled: true,
      createdByUserId: auth.userId,
      ownerUserId,
    },
  });
  return NextResponse.json({ link, created: true }, { status: 201 });
}
