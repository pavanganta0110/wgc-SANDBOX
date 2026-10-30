import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { guardStudentApi } from "@/lib/students/access";
import { generatePublicSlug } from "@/lib/givingLinks/validation";
import { DEFAULT_DONOR_FIELD_SETTINGS } from "@/lib/givingLinks/types";
import { resolveGivingLinkOwnerForCreate } from "@/lib/auth/givingLinkOwnership";
import { isAuthError } from "@/lib/auth/errors";
import { COLLEGE_LINK_ELIGIBLE, findCollegeLink } from "@/lib/students/collegeLink";

/**
 * Lists the giving links that could be the all-students link, flagging the
 * current one.
 */
export async function GET() {
  const guard = await guardStudentApi({ manage: true });
  if (!guard.ok) return guard.response;
  const { auth } = guard;
  const [current, links] = await Promise.all([
    findCollegeLink(auth.churchId),
    prisma.givingLink.findMany({
      where: { churchId: auth.churchId, ...COLLEGE_LINK_ELIGIBLE },
      select: { id: true, internalName: true, publicTitle: true, publicSlug: true, studentSelectionEnabled: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return NextResponse.json({
    currentId: current?.id ?? null,
    links: links.map((l) => ({ ...l, name: l.internalName || l.publicTitle })),
  });
}

/**
 * Attaches a different giving link as the all-students link. Turns on the
 * "who is this gift for?" picker on it if it was off.
 */
export async function PUT(req: Request) {
  const guard = await guardStudentApi({ manage: true });
  if (!guard.ok) return guard.response;
  const { auth } = guard;
  const body = await req.json().catch(() => ({}));
  const linkId = typeof body?.linkId === "string" ? body.linkId : "";
  const link = linkId
    ? await prisma.givingLink.findFirst({ where: { id: linkId, churchId: auth.churchId, ...COLLEGE_LINK_ELIGIBLE } })
    : null;
  if (!link) return NextResponse.json({ error: "Choose an active giving link that is not tied to a single student or to gift designations." }, { status: 400 });

  const updated = await prisma.$transaction(async (tx) => {
    await tx.church.update({ where: { id: auth.churchId }, data: { studentGivingLinkId: link.id } });
    return link.studentSelectionEnabled ? link : tx.givingLink.update({ where: { id: link.id }, data: { studentSelectionEnabled: true } });
  });
  revalidatePath(`/g/${updated.publicSlug}`);
  return NextResponse.json({ link: updated });
}

/**
 * The organization's one giving link where donors search for any student
 * ("Who is this gift for?"). Idempotent: returns the existing active link if
 * there is one, otherwise creates it. It is an ordinary giving link, so it
 * also appears under Giving Links where it can be edited and previewed.
 */
export async function POST(req?: Request) {
  const guard = await guardStudentApi({ manage: true });
  if (!guard.ok) return guard.response;
  const { auth } = guard;

  const body = await req?.json().catch(() => ({}));
  const createNew = body?.createNew === true;
  const newName = typeof body?.name === "string" ? body.name.trim().slice(0, 120) : "";

  const existing = createNew ? null : await findCollegeLink(auth.churchId);
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
      internalName: createNew && newName ? newName : "Student Giving — all students",
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
  // A page created on purpose from the picker becomes the all-students link.
  if (createNew) await prisma.church.update({ where: { id: auth.churchId }, data: { studentGivingLinkId: link.id } });
  return NextResponse.json({ link, created: true }, { status: 201 });
}
