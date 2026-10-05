import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { isValidReturnUrl } from "@/lib/givingLinks/validation";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { validateGivingLinkReassignment } from "@/lib/auth/givingLinkOwnership";
import { resolveViewScope } from "@/lib/auth/viewScope";
import { buildGivingLinkScope } from "@/lib/auth/scopes";
import { isAuthError } from "@/lib/auth/errors";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { validateFundAssignments, FundAssignmentError, loadAllAssignedFunds, type FundAssignmentInput } from "@/lib/giving/fundAssignment";
import { validateDefaultDonationSettings } from "@/lib/givingLinks/defaultDonationSettings";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { id } = await params;

  // Team-access Checkpoint 4: scoped by id + the same buildGivingLinkScope
  // fragment as the list route, not just churchId — a FUNDRAISER guessing
  // another user's link ID must get the same 404 as a nonexistent one, not
  // a 200 with data the list would never have shown them (test 2/9).
  const viewScope = await resolveViewScope(auth);
  const scope = buildGivingLinkScope(auth, viewScope);
  const link = await prisma.givingLink.findFirst({ where: { id, ...scope } });
  if (!link) return NextResponse.json({ error: "Giving link not found" }, { status: 404 });

  const fundAssignments = await loadAllAssignedFunds(link.id);
  return NextResponse.json({ link, fundAssignments });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { id } = await params;

  const existing = await prisma.givingLink.findFirst({ where: { id, churchId: auth.churchId } });
  if (!existing) return NextResponse.json({ error: "Giving link not found" }, { status: 404 });

  const body = await req.json();
  const {
    ownerUserId: requestedOwnerUserId,
    internalName,
    publicTitle,
    description,
    amountType,
    fixedAmountCents,
    minAmountCents,
    maxAmountCents,
    suggestedAmountsCents,
    allowCustomAmount,
    quantityItemLabel,
    linkType,
    maxSuccessfulUses,
    maxCollectedAmountCents,
    expiresAt,
    fundName,
    fundSelectionEnabled,
    fundAssignments,
    recurringEnabled,
    allowedFrequencies,
    defaultDonationType,
    defaultRecurringAmountCents,
    allowedPaymentMethods,
    donorFieldSettings,
    collectMailingAddress,
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

  // Team-access Checkpoint 3: reassignment is a distinct, permission-checked
  // operation layered onto the general-purpose edit endpoint — see
  // validateGivingLinkReassignment for exactly who's allowed to do this.
  // Reassignment never touches historical Payment/FinixSubscription
  // attribution (those are snapshotted once at creation) — only future
  // donations through this link are affected.
  const isReassignment = requestedOwnerUserId !== undefined && requestedOwnerUserId !== existing.ownerUserId;
  if (isReassignment) {
    try {
      await validateGivingLinkReassignment(
        auth,
        { currentOwnerUserId: existing.ownerUserId, linkChurchId: existing.churchId },
        requestedOwnerUserId
      );
    } catch (err) {
      if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
      throw err;
    }
  }

  const resolvedAmountType = amountType === "VARIABLE" || amountType === "FIXED" || amountType === "FIXED_QUANTITY" ? amountType : undefined;

  const resolvedFundSelectionEnabled: boolean | undefined = fundSelectionEnabled !== undefined ? !!fundSelectionEnabled : undefined;
  let validatedFundAssignments: FundAssignmentInput[] | undefined;
  const effectiveFundSelectionEnabled = resolvedFundSelectionEnabled ?? existing.fundSelectionEnabled;
  if (fundAssignments !== undefined) {
    try {
      validatedFundAssignments = await validateFundAssignments(auth.churchId, Array.isArray(fundAssignments) ? fundAssignments : []);
    } catch (err) {
      if (err instanceof FundAssignmentError) return NextResponse.json({ error: err.message }, { status: 400 });
      throw err;
    }
  }
  if (effectiveFundSelectionEnabled) {
    const finalAssignmentCount =
      validatedFundAssignments !== undefined
        ? validatedFundAssignments.length
        : await prisma.givingLinkFund.count({ where: { givingLinkId: id } });
    if (finalAssignmentCount === 0) {
      return NextResponse.json({ error: "Select at least one fund when fund selection is enabled" }, { status: 400 });
    }
  }

  // The default donation type/amount must stay valid against the link's
  // *resulting* configuration (e.g. turning recurring off, switching to a
  // fixed price, or changing the suggested amounts can invalidate them), so
  // whenever any input they depend on changes they're re-validated against
  // the merged values and re-normalized — never against the request alone.
  const defaultsRelevantKeys = [
    defaultDonationType,
    defaultRecurringAmountCents,
    recurringEnabled,
    amountType,
    minAmountCents,
    maxAmountCents,
    suggestedAmountsCents,
    allowCustomAmount,
  ];
  let validatedDefaults: { defaultDonationType: string; defaultRecurringAmountCents: number | null } | null = null;
  if (defaultsRelevantKeys.some((v) => v !== undefined)) {
    const effectiveAmountType = resolvedAmountType ?? (existing.amountType as "FIXED" | "VARIABLE" | "FIXED_QUANTITY");
    const effectiveSuggested = suggestedAmountsCents !== undefined ? suggestedAmountsCents : existing.suggestedAmountsJson;
    const defaultsResult = validateDefaultDonationSettings({
      defaultDonationType: defaultDonationType !== undefined ? defaultDonationType : existing.defaultDonationType,
      defaultRecurringAmountCents: defaultRecurringAmountCents !== undefined ? defaultRecurringAmountCents : existing.defaultRecurringAmountCents,
      recurringEnabled: recurringEnabled !== undefined ? !!recurringEnabled : existing.recurringEnabled,
      amountType: effectiveAmountType,
      minAmountCents: effectiveAmountType === "VARIABLE" ? (minAmountCents !== undefined ? minAmountCents : existing.minAmountCents) : null,
      maxAmountCents: effectiveAmountType === "VARIABLE" ? (maxAmountCents !== undefined ? maxAmountCents : existing.maxAmountCents) : null,
      suggestedAmountsCents: Array.isArray(effectiveSuggested) ? (effectiveSuggested as number[]) : [2500, 5000, 10000, 25000],
      allowCustomAmount: allowCustomAmount !== undefined ? !!allowCustomAmount : existing.allowCustomAmount,
    });
    if (!defaultsResult.ok) {
      return NextResponse.json({ error: defaultsResult.error }, { status: 400 });
    }
    validatedDefaults = defaultsResult.value;
  }

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
      ...(quantityItemLabel !== undefined ? { quantityItemLabel: quantityItemLabel?.trim() || null } : {}),
      ...(linkType === "ONE_TIME" || linkType === "MULTI_USE" ? { linkType } : {}),
      ...(maxSuccessfulUses !== undefined ? { maxSuccessfulUses: maxSuccessfulUses || null } : {}),
      ...(maxCollectedAmountCents !== undefined ? { maxCollectedAmountCents: maxCollectedAmountCents || null } : {}),
      ...(expiresAt !== undefined ? { expiresAt: expiresAt ? new Date(expiresAt) : null } : {}),
      ...(fundName !== undefined ? { fundName: fundName?.trim() || null } : {}),
      ...(resolvedFundSelectionEnabled !== undefined ? { fundSelectionEnabled: resolvedFundSelectionEnabled } : {}),
      ...(recurringEnabled !== undefined ? { recurringEnabled } : {}),
      ...(allowedFrequencies !== undefined ? { allowedFrequenciesJson: allowedFrequencies } : {}),
      ...(validatedDefaults ? { defaultDonationType: validatedDefaults.defaultDonationType, defaultRecurringAmountCents: validatedDefaults.defaultRecurringAmountCents } : {}),
      ...(allowedPaymentMethods !== undefined ? { allowedPaymentMethodsJson: allowedPaymentMethods } : {}),
      ...(donorFieldSettings !== undefined ? { donorFieldSettingsJson: donorFieldSettings } : {}),
      ...(typeof collectMailingAddress === "boolean" ? { collectMailingAddress } : {}),
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
      ...(isReassignment ? { ownerUserId: requestedOwnerUserId } : {}),
    },
  });

  if (validatedFundAssignments !== undefined) {
    // Full replace, not a diff — GivingLinkFund rows carry no historical
    // meaning of their own (unlike Payment.fundName snapshots, which are
    // never touched here); only the current assignment set matters.
    await prisma.givingLinkFund.deleteMany({ where: { givingLinkId: id } });
    if (validatedFundAssignments.length > 0) {
      await prisma.givingLinkFund.createMany({
        data: validatedFundAssignments.map((a) => ({
          givingLinkId: id,
          fundId: a.fundId,
          isDefault: a.isDefault ?? false,
          displayOrder: a.displayOrder ?? 0,
        })),
      });
    }
  }

  if (isReassignment) {
    await logDashboardAction({
      churchId: auth.churchId,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.rawRole,
      action: "GIVING_LINK_REASSIGNED",
      entityType: "GivingLink",
      entityId: link.id,
      metadata: {
        previousOwnerUserId: existing.ownerUserId,
        newOwnerUserId: requestedOwnerUserId,
      },
      req,
    });
  }

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
        auth.churchId,
        auth.userId,
        auth.email,
        auth.rawRole,
        req
      );
    }).catch(err => {
      console.error("Failed to import logoCleanup utility:", err);
    });
  }

  return NextResponse.json({ link });
}
