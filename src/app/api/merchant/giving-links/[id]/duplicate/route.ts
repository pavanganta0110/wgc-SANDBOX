import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { generatePublicSlug } from "@/lib/givingLinks/validation";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "church_admin" || !session.churchId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const source = await prisma.givingLink.findFirst({ where: { id, churchId: session.churchId } });
  if (!source) return NextResponse.json({ error: "Giving link not found" }, { status: 404 });

  let publicSlug = generatePublicSlug();
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await prisma.givingLink.findUnique({ where: { publicSlug } });
    if (!existing) break;
    publicSlug = generatePublicSlug();
  }

  // Settings only — attempt history, collected totals, sharing history, the
  // public slug, and the link identity itself are intentionally not copied.
  const duplicate = await prisma.givingLink.create({
    data: {
      churchId: source.churchId,
      publicSlug,
      internalName: `${source.internalName} (Copy)`,
      publicTitle: source.publicTitle,
      description: source.description,
      status: "ACTIVE",
      amountType: source.amountType,
      fixedAmountCents: source.fixedAmountCents,
      minAmountCents: source.minAmountCents,
      maxAmountCents: source.maxAmountCents,
      suggestedAmountsJson: source.suggestedAmountsJson ?? undefined,
      allowCustomAmount: source.allowCustomAmount,
      linkType: source.linkType,
      maxSuccessfulUses: source.maxSuccessfulUses,
      maxCollectedAmountCents: source.maxCollectedAmountCents,
      expiresAt: source.expiresAt,
      fundName: source.fundName,
      recurringEnabled: source.recurringEnabled,
      allowedFrequenciesJson: source.allowedFrequenciesJson ?? undefined,
      allowedPaymentMethodsJson: source.allowedPaymentMethodsJson ?? undefined,
      donorFieldSettingsJson: source.donorFieldSettingsJson ?? undefined,
      feeCoverEnabled: source.feeCoverEnabled,
      feeCoverDefaultOn: source.feeCoverDefaultOn,
      receiptSettingsJson: source.receiptSettingsJson ?? undefined,
      statementDescriptor: source.statementDescriptor,
      internalNote: source.internalNote,
      referenceNumber: source.referenceNumber,
      successReturnUrl: source.successReturnUrl,
      failureReturnUrl: source.failureReturnUrl,
      cancelReturnUrl: source.cancelReturnUrl,
      brandingSettingsJson: source.brandingSettingsJson ?? undefined,
      createdByUserId: session.userId,
    },
  });

  return NextResponse.json({ link: duplicate });
}
