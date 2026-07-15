import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { isValidReturnUrl } from "@/lib/givingLinks/validation";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "church_admin" || !session.churchId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const link = await prisma.givingLink.findFirst({ where: { id, churchId: session.churchId } });
  if (!link) return NextResponse.json({ error: "Giving link not found" }, { status: 404 });

  return NextResponse.json({ link });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "church_admin" || !session.churchId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const existing = await prisma.givingLink.findFirst({ where: { id, churchId: session.churchId } });
  if (!existing) return NextResponse.json({ error: "Giving link not found" }, { status: 404 });

  const body = await req.json();
  const {
    internalName,
    publicTitle,
    description,
    amountType,
    fixedAmountCents,
    minAmountCents,
    maxAmountCents,
    suggestedAmountsCents,
    allowCustomAmount,
    linkType,
    maxSuccessfulUses,
    maxCollectedAmountCents,
    expiresAt,
    fundName,
    recurringEnabled,
    allowedFrequencies,
    allowedPaymentMethods,
    donorFieldSettings,
    feeCoverEnabled,
    feeCoverDefaultOn,
    receiptSettings,
    statementDescriptor,
    internalNote,
    referenceNumber,
    successReturnUrl,
    failureReturnUrl,
    cancelReturnUrl,
    brandingSettings,
  } = body;

  if (internalName != null && !internalName.trim()) {
    return NextResponse.json({ error: "Internal name cannot be empty" }, { status: 400 });
  }
  if (publicTitle != null && !publicTitle.trim()) {
    return NextResponse.json({ error: "Public title cannot be empty" }, { status: 400 });
  }
  for (const url of [successReturnUrl, failureReturnUrl, cancelReturnUrl]) {
    if (url && !isValidReturnUrl(url)) {
      return NextResponse.json({ error: "Return URLs must be valid https:// links" }, { status: 400 });
    }
  }
  if (statementDescriptor && !/^[A-Za-z0-9 ]{0,18}$/.test(statementDescriptor)) {
    return NextResponse.json(
      { error: "Statement descriptor must be 18 characters or fewer, letters/numbers/spaces only" },
      { status: 400 }
    );
  }
  if (Array.isArray(allowedPaymentMethods) && allowedPaymentMethods.length === 0) {
    return NextResponse.json({ error: "At least one payment method is required" }, { status: 400 });
  }

  const resolvedAmountType = amountType === "VARIABLE" || amountType === "FIXED" ? amountType : undefined;

  const link = await prisma.givingLink.update({
    where: { id },
    data: {
      ...(internalName != null ? { internalName: internalName.trim() } : {}),
      ...(publicTitle != null ? { publicTitle: publicTitle.trim() } : {}),
      ...(description !== undefined ? { description: description?.trim() || null } : {}),
      ...(resolvedAmountType ? { amountType: resolvedAmountType } : {}),
      ...(fixedAmountCents !== undefined ? { fixedAmountCents } : {}),
      ...(minAmountCents !== undefined ? { minAmountCents } : {}),
      ...(maxAmountCents !== undefined ? { maxAmountCents } : {}),
      ...(suggestedAmountsCents !== undefined ? { suggestedAmountsJson: suggestedAmountsCents } : {}),
      ...(allowCustomAmount !== undefined ? { allowCustomAmount } : {}),
      ...(linkType === "ONE_TIME" || linkType === "MULTI_USE" ? { linkType } : {}),
      ...(maxSuccessfulUses !== undefined ? { maxSuccessfulUses: maxSuccessfulUses || null } : {}),
      ...(maxCollectedAmountCents !== undefined ? { maxCollectedAmountCents: maxCollectedAmountCents || null } : {}),
      ...(expiresAt !== undefined ? { expiresAt: expiresAt ? new Date(expiresAt) : null } : {}),
      ...(fundName !== undefined ? { fundName: fundName?.trim() || null } : {}),
      ...(recurringEnabled !== undefined ? { recurringEnabled } : {}),
      ...(allowedFrequencies !== undefined ? { allowedFrequenciesJson: allowedFrequencies } : {}),
      ...(allowedPaymentMethods !== undefined ? { allowedPaymentMethodsJson: allowedPaymentMethods } : {}),
      ...(donorFieldSettings !== undefined ? { donorFieldSettingsJson: donorFieldSettings } : {}),
      ...(feeCoverEnabled !== undefined ? { feeCoverEnabled } : {}),
      ...(feeCoverDefaultOn !== undefined ? { feeCoverDefaultOn } : {}),
      ...(receiptSettings !== undefined ? { receiptSettingsJson: receiptSettings } : {}),
      ...(statementDescriptor !== undefined ? { statementDescriptor: statementDescriptor?.trim() || null } : {}),
      ...(internalNote !== undefined ? { internalNote: internalNote?.trim() || null } : {}),
      ...(referenceNumber !== undefined ? { referenceNumber: referenceNumber?.trim() || null } : {}),
      ...(successReturnUrl !== undefined ? { successReturnUrl: successReturnUrl?.trim() || null } : {}),
      ...(failureReturnUrl !== undefined ? { failureReturnUrl: failureReturnUrl?.trim() || null } : {}),
      ...(cancelReturnUrl !== undefined ? { cancelReturnUrl: cancelReturnUrl?.trim() || null } : {}),
      ...(brandingSettings !== undefined ? { brandingSettingsJson: brandingSettings } : {}),
    },
  });

  revalidatePath(`/g/${link.publicSlug}`);

  const oldBranding = existing.brandingSettingsJson as any;
  const oldLogoUrl = oldBranding?.light?.logoUrl;
  const newLogoUrl = brandingSettings?.light?.logoUrl;

  if (oldLogoUrl && oldLogoUrl !== newLogoUrl) {
    // Run cleanup asynchronously so it doesn't block the API response
    import("@/lib/givingLinks/logoCleanup").then(({ cleanupUnusedLogo }) => {
      cleanupUnusedLogo(
        oldLogoUrl,
        id,
        session!.churchId!,
        session!.userId!,
        session!.email!,
        session!.role!,
        req
      );
    }).catch(err => {
      console.error("Failed to import logoCleanup utility:", err);
    });
  }

  return NextResponse.json({ link });
}
