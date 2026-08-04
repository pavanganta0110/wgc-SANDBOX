import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { toSafeErrorResponse } from "@/lib/utils/errorNormalizer";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { resolveOrCreateDonor } from "@/lib/donors/resolveOrCreateDonor";
import { isValidEmail, normalizeUSPhone } from "@/lib/validation";
import { classifySource, isExternalPaymentMethod } from "@/lib/donations/externalDonationTypes";
import { findPossibleDuplicateExternalDonation } from "@/lib/donations/checkExternalDonationDuplicate";
import { resolveExternalDonationScopedUserId } from "@/lib/donations/externalDonationScope";
import { cleanAddressInput, hasAnyAddressField, isAddressSource, applyDonorAddressUpdate } from "@/lib/donors/donorAddress";

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
    const resolved = await resolveOrCreateDonor({
      churchId: auth.churchId,
      name: donorName,
      email: donorEmail,
      phone: donorPhone,
    });
    donorId = resolved.id;
    donorMatchStatus = "MATCHED";

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
    },
  });

  await prisma.externalDonationAuditLog.create({
    data: {
      externalDonationId: created.id,
      action: "CREATED",
      toValue: donorMatchStatus,
      performedByUserId: auth.userId,
    },
  });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.role,
    action: "external_donation.created",
    entityType: "ExternalDonation",
    entityId: created.id,
    metadata: { paymentMethod, donationAmountCents, source, possibleDuplicate: Boolean(duplicate) },
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
