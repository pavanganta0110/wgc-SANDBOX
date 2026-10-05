import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { toSafeErrorResponse } from "@/lib/utils/errorNormalizer";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { resolveOrCreateDonorWithMatchReview } from "@/lib/donors/resolveOrCreateDonorWithMatchReview";
import { isValidEmail, normalizeUSPhone } from "@/lib/validation";
import { classifySource, isExternalPaymentMethod } from "@/lib/donations/externalDonationTypes";
import { findPossibleDuplicateExternalDonation } from "@/lib/donations/checkExternalDonationDuplicate";
import { resolveExternalDonationScopedUserId } from "@/lib/donations/externalDonationScope";
import { cleanAddressInput, hasAnyAddressField, isAddressSource, applyDonorAddressUpdate } from "@/lib/donors/donorAddress";
import { computePledgeFulfillment } from "@/lib/pledges/pledgeFulfillment";

export async function GET(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canViewOwnTransactions");
  } catch (err) {
    if (isAuthError(err)) return toSafeErrorResponse(err.message, err.status);
    throw err;
  }

  const { searchParams } = new URL(req.url);
  const unmatchedOnly = searchParams.get("unmatched") === "true";
  const status = searchParams.get("status");
  // FUNDRAISER/VIEWER (no canViewAllTransactions) only see donations they
  // personally recorded — same rule as every other Payments/Donors list.
  const scopedUserId = await resolveExternalDonationScopedUserId(auth);

  const rows = await prisma.externalDonation.findMany({
    where: {
      churchId: auth.churchId,
      ...(scopedUserId ? { createdByUserId: scopedUserId } : {}),
      ...(unmatchedOnly ? { donorMatchStatus: "UNMATCHED" } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: { donationDate: "desc" },
    take: 200,
  });

  return NextResponse.json({ donations: rows });
}

export async function POST(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canCreateExternalDonation");
  } catch (err) {
    if (isAuthError(err)) return toSafeErrorResponse(err.message, err.status);
    throw err;
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const {
    donationAmountCents,
    donationDate,
    paymentMethod,
    otherPaymentMethodName,
    donorMode, // "existing" | "new" | "anonymous" | "unmatched"
    donorId: existingDonorId,
    donorName,
    donorEmail,
    donorPhone,
    donorAddress,
    fundId,
    fundName,
    campaign,
    givingPageLabel,
    donationPurpose,
    externalTransactionId,
    confirmationNumber,
    accountOrDestinationLabel,
    providerFeeCents,
    netAmountReceivedCents,
    internalNote,
    receivedByUserId,
    checkNumber,
    checkDate,
    bankName,
    depositStatus,
    terminalOrProviderName,
    lastFourDigits,
    cardType,
    includeInAnnualStatement,
    sendReceipt,
    isTaxDeductible,
    deductibleAmountCents,
    goodsOrServicesProvided,
    goodsOrServicesDescription,
    goodsOrServicesValueCents,
    pledgeId,
    fundraisingCampaignId,
    campaignTeamId,
    campaignFundraiserId,
  } = body ?? {};

  if (typeof donationAmountCents !== "number" || donationAmountCents < 1) {
    return NextResponse.json({ error: "Donation amount is required" }, { status: 400 });
  }
  if (!donationDate) {
    return NextResponse.json({ error: "Donation date is required" }, { status: 400 });
  }
  if (!isExternalPaymentMethod(paymentMethod)) {
    return NextResponse.json({ error: "A valid payment method is required" }, { status: 400 });
  }
  if (paymentMethod === "OTHER" && !otherPaymentMethodName?.trim()) {
    return NextResponse.json({ error: "Payment method name is required when Other is selected" }, { status: 400 });
  }
  if (donorEmail && !isValidEmail(donorEmail)) {
    return NextResponse.json({ error: "Please enter a valid donor email address" }, { status: 400 });
  }
  let normalizedPhone: string | null = null;
  if (donorPhone) {
    normalizedPhone = normalizeUSPhone(donorPhone);
    if (!normalizedPhone) {
      return NextResponse.json({ error: "Please enter a valid U.S. phone number" }, { status: 400 });
    }
  }

  const parsedDonationDate = new Date(donationDate);
  if (Number.isNaN(parsedDonationDate.getTime())) {
    return NextResponse.json({ error: "Invalid donation date" }, { status: 400 });
  }

  if (typeof deductibleAmountCents === "number" && deductibleAmountCents > donationAmountCents) {
    return NextResponse.json({ error: "Deductible amount cannot be greater than the donation amount" }, { status: 400 });
  }
  if (typeof goodsOrServicesValueCents === "number" && goodsOrServicesValueCents > donationAmountCents) {
    return NextResponse.json({ error: "Value of goods or services cannot be greater than the donation amount" }, { status: 400 });
  }

  // Donor resolution — never auto-merge on name alone (resolveOrCreateDonor
  // matches on finixIdentityId/email/phone only, same rule as every other
  // donation entry path in this codebase).
  let donorId: string | null = null;
  let isAnonymous = false;
  let donorMatchStatus: "MATCHED" | "ANONYMOUS" | "UNMATCHED" = "UNMATCHED";
  let possibleMatchId: string | undefined;

  if (donorMode === "anonymous") {
    isAnonymous = true;
    donorMatchStatus = "ANONYMOUS";
  } else if (donorMode === "existing" && existingDonorId) {
    const donor = await prisma.donor.findFirst({ where: { id: existingDonorId, churchId: auth.churchId } });
    if (!donor) return NextResponse.json({ error: "Selected donor not found" }, { status: 400 });
    donorId = donor.id;
    donorMatchStatus = "MATCHED";
  } else if (donorMode === "new") {
    if (!donorName?.trim() && !donorEmail && !normalizedPhone) {
      return NextResponse.json({ error: "Provide at least a donor name, email, or phone to create a donor" }, { status: 400 });
    }
    const resolved = await resolveOrCreateDonorWithMatchReview({
      churchId: auth.churchId,
      name: donorName,
      email: donorEmail,
      phone: donorPhone,
      sourceType: "EXTERNAL_DONATION_ENTRY",
      donationAmountCents,
      donationDate: parsedDonationDate,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.role,
      req,
    });
    donorId = resolved.id;
    donorMatchStatus = "MATCHED";
    possibleMatchId = resolved.possibleMatchId;

    if (donorAddress && typeof donorAddress === "object") {
      const cleaned = cleanAddressInput(donorAddress);
      if (hasAnyAddressField(cleaned)) {
        const source = isAddressSource(donorAddress.source) ? donorAddress.source : "EXTERNAL_DONATION";
        await applyDonorAddressUpdate({
          donorId,
          churchId: auth.churchId,
          newAddress: cleaned,
          source,
          enteredByDonor: false,
          actorUserId: auth.userId,
          actorEmail: auth.email,
          actorRole: auth.role,
          req,
        });
        // A needs_confirmation result (donor already had a different
        // address) is not treated as an error here — the donation still
        // records; the merchant can resolve the address conflict from the
        // donor's own profile afterward, per the non-destructive-overwrite
        // rule.
      }
    }
  } else {
    // "unmatched" or omitted — money received, donor unknown for now.
    donorMatchStatus = "UNMATCHED";
  }

  const source = classifySource(paymentMethod);

  // Optional "fulfills a pledge" / "counts toward a fundraising campaign"
  // attribution — see ExternalDonation.pledgeId/fundraisingCampaignId/
  // campaignTeamId/campaignFundraiserId in schema.prisma. Resolved and
  // validated up front so the create() below never writes an id that
  // doesn't actually belong to this church (or, for team/fundraiser,
  // doesn't belong to each other).
  let resolvedPledgeId: string | null = null;
  if (pledgeId) {
    const pledge = await prisma.pledge.findFirst({ where: { id: pledgeId, churchId: auth.churchId } });
    if (!pledge) return NextResponse.json({ error: "Pledge not found" }, { status: 404 });
    if (pledge.status === "CANCELED") {
      return NextResponse.json({ error: "Cannot link a donation to a canceled pledge" }, { status: 400 });
    }
    // Only enforced when the donation itself is attributed to a known
    // donor — an anonymous/unmatched donation can still be manually tied
    // to a specific pledge (e.g. a staff member recording a cash gift they
    // know came from that pledger, entered before matching the donor
    // record), same leniency the donor-matching flow itself allows.
    if (donorId && pledge.donorId && pledge.donorId !== donorId) {
      return NextResponse.json({ error: "This pledge belongs to a different donor" }, { status: 400 });
    }
    resolvedPledgeId = pledge.id;
  }

  let resolvedFundraisingCampaignId: string | null = null;
  let resolvedCampaignTeamId: string | null = null;
  let resolvedCampaignFundraiserId: string | null = null;
  if (campaignFundraiserId) {
    const fundraiser = await prisma.campaignFundraiser.findFirst({ where: { id: campaignFundraiserId, churchId: auth.churchId } });
    if (!fundraiser) return NextResponse.json({ error: "Fundraiser not found" }, { status: 404 });
    if (campaignTeamId && fundraiser.campaignTeamId !== campaignTeamId) {
      return NextResponse.json({ error: "This fundraiser is not on the selected team" }, { status: 400 });
    }
    if (fundraisingCampaignId && fundraiser.fundraisingCampaignId !== fundraisingCampaignId) {
      return NextResponse.json({ error: "This fundraiser is not on the selected campaign" }, { status: 400 });
    }
    resolvedCampaignFundraiserId = fundraiser.id;
    resolvedCampaignTeamId = fundraiser.campaignTeamId;
    resolvedFundraisingCampaignId = fundraiser.fundraisingCampaignId;
  } else if (campaignTeamId) {
    const team = await prisma.campaignTeam.findFirst({ where: { id: campaignTeamId, churchId: auth.churchId } });
    if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });
    if (fundraisingCampaignId && team.fundraisingCampaignId !== fundraisingCampaignId) {
      return NextResponse.json({ error: "This team is not on the selected campaign" }, { status: 400 });
    }
    resolvedCampaignTeamId = team.id;
    resolvedFundraisingCampaignId = team.fundraisingCampaignId;
  } else if (fundraisingCampaignId) {
    const campaign = await prisma.fundraisingCampaign.findFirst({ where: { id: fundraisingCampaignId, churchId: auth.churchId } });
    if (!campaign) return NextResponse.json({ error: "Fundraising campaign not found" }, { status: 404 });
    resolvedFundraisingCampaignId = campaign.id;
  }

  const duplicate = await findPossibleDuplicateExternalDonation({
    churchId: auth.churchId,
    donorId,
    donationAmountCents,
    donationDate: parsedDonationDate,
    externalTransactionId,
    confirmationNumber,
  });

  const created = await prisma.externalDonation.create({
    data: {
      churchId: auth.churchId,
      donorId,
      donorMatchStatus,
      isAnonymous,
      donationAmountCents,
      donationDate: parsedDonationDate,
      paymentMethod,
      otherPaymentMethodName: paymentMethod === "OTHER" ? otherPaymentMethodName?.trim() || null : null,
      source,
      fundId: fundId || null,
      fundName: fundName || null,
      campaign: campaign || null,
      givingPageLabel: givingPageLabel || null,
      donationPurpose: donationPurpose || null,
      externalTransactionId: externalTransactionId || null,
      confirmationNumber: confirmationNumber || null,
      accountOrDestinationLabel: accountOrDestinationLabel || null,
      providerFeeCents: typeof providerFeeCents === "number" ? providerFeeCents : null,
      netAmountReceivedCents: typeof netAmountReceivedCents === "number" ? netAmountReceivedCents : null,
      internalNote: internalNote || null,
      receivedByUserId: receivedByUserId || auth.userId,
      checkNumber: checkNumber || null,
      checkDate: checkDate ? new Date(checkDate) : null,
      bankName: bankName || null,
      depositStatus: depositStatus || (paymentMethod === "CHECK" ? "RECEIVED" : null),
      terminalOrProviderName: terminalOrProviderName || null,
      lastFourDigits: lastFourDigits || null,
      cardType: cardType || null,
      includeInAnnualStatement: includeInAnnualStatement !== false,
      isTaxDeductible: isTaxDeductible !== false,
      deductibleAmountCents: typeof deductibleAmountCents === "number" ? deductibleAmountCents : null,
      goodsOrServicesProvided: Boolean(goodsOrServicesProvided),
      goodsOrServicesDescription: goodsOrServicesProvided ? goodsOrServicesDescription || null : null,
      goodsOrServicesValueCents: goodsOrServicesProvided && typeof goodsOrServicesValueCents === "number" ? goodsOrServicesValueCents : null,
      status: "RECEIVED",
      processedByWgc: false,
      finixTransferId: null,
      finixSettlementId: null,
      processingFeeCents: 0,
      supplementalFeeCents: 0,
      possibleDuplicate: Boolean(duplicate),
      duplicateOfExternalDonationId: duplicate?.id ?? null,
      createdByUserId: auth.userId,
      pledgeId: resolvedPledgeId,
      fundraisingCampaignId: resolvedFundraisingCampaignId,
      campaignTeamId: resolvedCampaignTeamId,
      campaignFundraiserId: resolvedCampaignFundraiserId,
    },
  });

  // Rolls this donation into the pledge's fulfilledAmountCents/status —
  // mirrors exactly what POST /api/merchant/pledges/[pledgeId]/fulfillments
  // does for a donation linked after the fact; this just does it at
  // creation time instead of requiring a separate follow-up step.
  // Fundraising-campaign totals need no equivalent call: campaignTotals.ts
  // sums tagged rows on read, nothing to roll up and cache.
  if (resolvedPledgeId) {
    await computePledgeFulfillment(resolvedPledgeId);
  }

  await prisma.externalDonationAuditLog.create({
    data: {
      externalDonationId: created.id,
      action: "CREATED",
      toValue: donorMatchStatus,
      performedByUserId: auth.userId,
    },
  });

  if (possibleMatchId) {
    await prisma.possibleDonorMatch.update({ where: { id: possibleMatchId }, data: { sourceId: created.id } });
  }

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.role,
    action: "external_donation.created",
    entityType: "ExternalDonation",
    entityId: created.id,
    metadata: {
      paymentMethod,
      donationAmountCents,
      source,
      possibleDuplicate: Boolean(duplicate),
      pledgeId: resolvedPledgeId,
      fundraisingCampaignId: resolvedFundraisingCampaignId,
      campaignTeamId: resolvedCampaignTeamId,
      campaignFundraiserId: resolvedCampaignFundraiserId,
    },
    req,
  });

  if (sendReceipt && donorId && !isAnonymous) {
    try {
      const { sendExternalDonationReceiptEmail } = await import("@/lib/donations/sendExternalDonationReceiptEmail");
      await sendExternalDonationReceiptEmail(created.id, auth.churchId, auth.userId);
    } catch {
      // Receipt failure never blocks the donation record from being saved —
      // it's just not marked sent; the merchant can retry from the list.
    }
  }

  return NextResponse.json({ donation: created, possibleDuplicate: Boolean(duplicate) }, { status: 201 });
}
