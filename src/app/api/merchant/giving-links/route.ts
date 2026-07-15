import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { generatePublicSlug, isValidReturnUrl } from "@/lib/givingLinks/validation";
import { DEFAULT_DONOR_FIELD_SETTINGS } from "@/lib/givingLinks/types";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "church_admin" || !session.churchId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || undefined;
  const linkType = searchParams.get("linkType") || undefined;
  const amountType = searchParams.get("amountType") || undefined;
  const name = searchParams.get("name") || undefined;

  const links = await prisma.givingLink.findMany({
    where: {
      churchId: session.churchId,
      ...(status ? { status } : {}),
      ...(linkType ? { linkType } : {}),
      ...(amountType ? { amountType } : {}),
      ...(name ? { internalName: { contains: name, mode: "insensitive" } } : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ links });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "church_admin" || !session.churchId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  if (!internalName?.trim() || !publicTitle?.trim()) {
    return NextResponse.json({ error: "Internal name and public title are required" }, { status: 400 });
  }

  const resolvedAmountType = amountType === "VARIABLE" ? "VARIABLE" : "FIXED";
  if (resolvedAmountType === "FIXED" && (!fixedAmountCents || fixedAmountCents < 100)) {
    return NextResponse.json({ error: "Fixed amount must be at least $1.00" }, { status: 400 });
  }
  if (resolvedAmountType === "VARIABLE") {
    if (minAmountCents != null && maxAmountCents != null && minAmountCents > maxAmountCents) {
      return NextResponse.json({ error: "Minimum amount cannot exceed maximum amount" }, { status: 400 });
    }
  }

  const methods = Array.isArray(allowedPaymentMethods) ? allowedPaymentMethods.filter(Boolean) : [];
  if (methods.length === 0) {
    return NextResponse.json({ error: "At least one payment method is required" }, { status: 400 });
  }

  for (const url of [successReturnUrl, failureReturnUrl, cancelReturnUrl]) {
    if (url && !isValidReturnUrl(url)) {
      return NextResponse.json({ error: "Return URLs must be valid https:// links" }, { status: 400 });
    }
  }

  // Statement descriptors are constrained by the card networks — letters,
  // numbers, spaces only, capped short (mirrors the slice(0,18) used
  // elsewhere in the codebase for the same field).
  if (statementDescriptor && !/^[A-Za-z0-9 ]{0,18}$/.test(statementDescriptor)) {
    return NextResponse.json(
      { error: "Statement descriptor must be 18 characters or fewer, letters/numbers/spaces only" },
      { status: 400 }
    );
  }

  let publicSlug = generatePublicSlug();
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await prisma.givingLink.findUnique({ where: { publicSlug } });
    if (!existing) break;
    publicSlug = generatePublicSlug();
  }

  const link = await prisma.givingLink.create({
    data: {
      churchId: session.churchId,
      publicSlug,
      internalName: internalName.trim(),
      publicTitle: publicTitle.trim(),
      description: description?.trim() || null,
      status: "ACTIVE",
      amountType: resolvedAmountType,
      fixedAmountCents: resolvedAmountType === "FIXED" ? fixedAmountCents : null,
      minAmountCents: resolvedAmountType === "VARIABLE" ? minAmountCents ?? null : null,
      maxAmountCents: resolvedAmountType === "VARIABLE" ? maxAmountCents ?? null : null,
      suggestedAmountsJson: Array.isArray(suggestedAmountsCents) ? suggestedAmountsCents : [2500, 5000, 10000, 25000],
      allowCustomAmount: allowCustomAmount ?? true,
      linkType: linkType === "ONE_TIME" ? "ONE_TIME" : "MULTI_USE",
      maxSuccessfulUses: maxSuccessfulUses || null,
      maxCollectedAmountCents: maxCollectedAmountCents || null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      fundName: fundName?.trim() || null,
      recurringEnabled: recurringEnabled ?? false,
      allowedFrequenciesJson: Array.isArray(allowedFrequencies) ? allowedFrequencies : ["MONTHLY"],
      allowedPaymentMethodsJson: methods,
      donorFieldSettingsJson: donorFieldSettings || DEFAULT_DONOR_FIELD_SETTINGS,
      feeCoverEnabled: feeCoverEnabled ?? true,
      feeCoverDefaultOn: feeCoverDefaultOn ?? true,
      receiptSettingsJson: receiptSettings || null,
      statementDescriptor: statementDescriptor?.trim() || null,
      internalNote: internalNote?.trim() || null,
      referenceNumber: referenceNumber?.trim() || null,
      successReturnUrl: successReturnUrl?.trim() || null,
      failureReturnUrl: failureReturnUrl?.trim() || null,
      cancelReturnUrl: cancelReturnUrl?.trim() || null,
      brandingSettingsJson: brandingSettings || null,
      createdByUserId: session.userId,
    },
  });

  return NextResponse.json({ link });
}
