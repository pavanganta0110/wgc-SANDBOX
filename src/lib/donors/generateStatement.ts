import { prisma } from "@/lib/prisma";
import { renderToBuffer } from "@react-pdf/renderer";
import { computeYearEndStatement } from "@/lib/donors/yearEndStatements";
import { YearEndStatementPdf } from "@/lib/donors/pdf/YearEndStatementPdf";
import { formatPersonName } from "@/lib/formatPersonName";
import { isValidEmail } from "@/lib/donors/donorContact";
import { sendWgcEmail } from "@/lib/email";
import { DEFAULT_THANK_YOU_MESSAGE, STATEMENT_DISCLAIMER, resolveStatementPdfSettings } from "@/lib/donors/generateStatementDefaults";
import { resolveAcknowledgmentText } from "@/lib/settings/acknowledgmentDefaults";

export { DEFAULT_THANK_YOU_MESSAGE };

export interface GeneratedStatement {
  statementId: string;
  version: number;
  status: "NEEDS_REVIEW" | "READY";
  missingFields: string[];
}

/**
 * Generates (or regenerates, as a new version) a year-end statement for one
 * donor. Idempotent within a version: calling this again with unchanged
 * data recomputes the same totals and creates a new version only when the
 * caller explicitly wants one (see regenerate=true) — the normal path
 * reuses the latest READY/GENERATED version if the totals haven't changed.
 * Uses immutable snapshots of donor/org identity so a later profile edit
 * never alters a statement already generated or sent.
 */
export async function generateYearEndStatement(
  donorId: string,
  churchId: string,
  taxYear: number,
  generatedByUserId: string | null,
  options?: { forceNewVersion?: boolean },
): Promise<GeneratedStatement> {
  const [donor, church] = await Promise.all([
    prisma.donor.findFirst({ where: { id: donorId, churchId } }),
    prisma.church.findUnique({ where: { id: churchId } }),
  ]);
  if (!donor || !church) throw new Error("Donor or organization not found");

  const calc = await computeYearEndStatement(donorId, churchId, taxYear);

  const donorName = donor.anonymousPreference ? "Anonymous Donor" : formatPersonName(donor.name);
  const missingFields: string[] = [];
  if (donorName === "—" || donor.anonymousPreference) {
    if (!donor.anonymousPreference) missingFields.push("name");
  }
  if (!donor.email || !isValidEmail(donor.email)) missingFields.push("email");

  const status: "NEEDS_REVIEW" | "READY" = missingFields.length > 0 ? "NEEDS_REVIEW" : "READY";

  const existingLatest = await prisma.annualDonationStatement.findFirst({
    where: { donorId, taxYear, supersededAt: null },
    orderBy: { version: "desc" },
  });

  let version = 1;
  if (existingLatest) {
    if (!options?.forceNewVersion && existingLatest.eligibleAmountCents === calc.recordedTotalCents && existingLatest.donationCount === calc.donationCount) {
      return { statementId: existingLatest.id, version: existingLatest.version, status: existingLatest.statementStatus as any, missingFields };
    }
    await prisma.annualDonationStatement.update({ where: { id: existingLatest.id }, data: { supersededAt: new Date() } });
    version = existingLatest.version + 1;
  }

  const organizationAddress = [church.addressLine1, church.addressLine2, [church.city, church.state, church.postalCode].filter(Boolean).join(", ")]
    .filter(Boolean)
    .join(", ") || null;

  const statement = await prisma.annualDonationStatement.create({
    data: {
      churchId,
      donorId,
      taxYear,
      version,
      statementStatus: status,
      deliveryStatus: "NOT_SENT",
      grossDonatedCents: calc.grossDonatedCents,
      refundedAmountCents: calc.refundedAmountCents,
      returnedAmountCents: calc.returnedAmountCents,
      disputeAdjustmentCents: 0,
      eligibleAmountCents: calc.recordedTotalCents,
      donationCount: calc.donationCount,
      donorNameSnapshot: donorName,
      donorEmailSnapshot: donor.email,
      donorAddressSnapshot: donor.addressLine1
        ? { line1: donor.addressLine1, line2: donor.addressLine2, city: donor.city, state: donor.state, postalCode: donor.postalCode, country: donor.country }
        : undefined,
      organizationNameSnapshot: church.name,
      organizationAddressSnapshot: organizationAddress ? { formatted: organizationAddress } : undefined,
      organizationTaxIdSnapshot: church.taxId,
      generatedByUserId,
      generatedAt: new Date(),
    },
  });

  await prisma.annualDonationStatementLine.createMany({
    data: calc.lines.map((l) => ({
      annualStatementId: statement.id,
      paymentId: l.paymentId,
      donationDate: l.donationDate,
      reference: l.reference,
      fundOrCampaignName: l.fundName,
      grossAmountCents: l.grossAmountCents,
      donorCoveredFeeCents: l.donorCoveredFeeCents,
      refundedAmountCents: l.refundedAmountCents,
      returnedAmountCents: l.returnedAmountCents,
      disputeAdjustmentCents: 0,
      eligibleAmountCents: l.finalRecordedAmountCents,
      goodsServicesProvided: l.goodsServicesProvided,
      goodsServicesDescription: l.goodsServicesDescription,
      goodsServicesFairMarketValueCents: l.goodsServicesFairMarketValueCents,
      recordedContributionAmountCents: l.recordedContributionAmountCents,
    })),
  });

  return { statementId: statement.id, version, status, missingFields };
}

/** Renders the PDF for an already-generated statement — pure function of its own immutable snapshot + lines, never re-reads live donor/org data. */
export async function renderStatementPdf(statementId: string, churchId: string): Promise<Buffer> {
  const statement = await prisma.annualDonationStatement.findFirst({ where: { id: statementId, churchId } });
  if (!statement) throw new Error("Statement not found");

  const lines = await prisma.annualDonationStatementLine.findMany({ where: { annualStatementId: statementId }, orderBy: { donationDate: "asc" } });
  const church = await prisma.church.findUnique({ where: { id: churchId } });

  const orgAddress = statement.organizationAddressSnapshot as any;
  const settings = resolveStatementPdfSettings(church);

  // A statement covers many contributions — when any of them individually
  // disclosed goods/services, that per-contribution disclosure is listed
  // rather than collapsed into one blanket line, since the "no goods or
  // services" statement would otherwise be inaccurate for the year as a
  // whole.
  const linesWithGoodsServices = lines.filter((l) => l.goodsServicesProvided);
  const acknowledgmentText =
    linesWithGoodsServices.length > 0
      ? linesWithGoodsServices
          .map((l) => resolveAcknowledgmentText(church, l.goodsServicesDescription, l.goodsServicesFairMarketValueCents))
          .join(" ")
      : resolveAcknowledgmentText(church, null, null);

  const totalGoodsServicesValueCents = lines.reduce((s, l) => s + (l.goodsServicesFairMarketValueCents ?? 0), 0);
  const totalRecordedContributionAmountCents = lines.reduce((s, l) => s + (l.recordedContributionAmountCents ?? l.eligibleAmountCents), 0);

  const buffer = await renderToBuffer(
    YearEndStatementPdf({
      organizationName: statement.organizationNameSnapshot || church?.name || "Organization",
      organizationLogoUrl: church?.logoUrl ?? null,
      organizationAddress: orgAddress?.formatted ?? null,
      organizationEmail: church?.primaryContactEmail ?? null,
      organizationPhone: church?.phone ?? null,
      organizationWebsite: settings.organizationWebsite,
      organizationTaxId: settings.organizationTaxId,
      donorName: statement.donorNameSnapshot || "Donor",
      donorEmail: statement.donorEmailSnapshot,
      taxYear: statement.taxYear,
      donationCount: statement.donationCount,
      grossDonatedCents: statement.grossDonatedCents,
      refundedAmountCents: statement.refundedAmountCents,
      returnedAmountCents: statement.returnedAmountCents,
      recordedTotalCents: statement.eligibleAmountCents,
      showDonorCoveredFees: settings.showDonorCoveredFees,
      totalGoodsServicesValueCents,
      totalRecordedContributionAmountCents,
      lines: lines.map((l) => ({
        donationDate: l.donationDate!,
        reference: l.reference || "",
        fundName: l.fundOrCampaignName,
        grossAmountCents: l.grossAmountCents,
        donorCoveredFeeCents: l.donorCoveredFeeCents,
        refundedAmountCents: l.refundedAmountCents,
        returnedAmountCents: l.returnedAmountCents,
        finalRecordedAmountCents: l.eligibleAmountCents,
        paymentMethodLabel: "",
        goodsServicesProvided: l.goodsServicesProvided,
        goodsServicesDescription: l.goodsServicesDescription,
        goodsServicesFairMarketValueCents: l.goodsServicesFairMarketValueCents,
        recordedContributionAmountCents: l.recordedContributionAmountCents ?? l.eligibleAmountCents,
      })),
      thankYouMessage: settings.thankYouMessage,
      acknowledgmentText,
      disclaimer: settings.disclaimer,
      signatureName: settings.signatureName,
      signatureTitle: settings.signatureTitle,
      signatureImageUrl: settings.signatureImageUrl,
      generatedAt: statement.generatedAt || statement.createdAt,
    }),
  );

  return buffer as unknown as Buffer;
}

/**
 * Sends the statement PDF by email — always re-reads the donor's CURRENT
 * email at send time (never the snapshot, and never a cached value), per
 * the explicit instruction not to reuse another donor's or a stale email.
 * A statement missing a valid email is refused here, not just at generate
 * time.
 */
export async function sendYearEndStatementEmail(statementId: string, churchId: string, actorEmail: string | null) {
  const statement = await prisma.annualDonationStatement.findFirst({ where: { id: statementId, churchId } });
  if (!statement) throw new Error("Statement not found");

  const donor = await prisma.donor.findFirst({ where: { id: statement.donorId, churchId } });
  if (!donor?.email || !isValidEmail(donor.email)) {
    await prisma.annualDonationStatement.update({ where: { id: statement.id }, data: { statementStatus: "NEEDS_REVIEW" } });
    throw new Error("Donor is missing a valid email address — marked Needs Review");
  }

  const church = await prisma.church.findUnique({ where: { id: churchId } });
  const pdf = await renderStatementPdf(statementId, churchId);
  const donorName = donor.anonymousPreference ? "Anonymous Donor" : formatPersonName(donor.name);
  const orgName = church?.statementSenderName || church?.name || statement.organizationNameSnapshot || "Organization";

  const subject = church?.statementSubjectTemplate
    ? church.statementSubjectTemplate.replace(/\[YEAR\]/g, String(statement.taxYear)).replace(/\[Organization Name\]/gi, orgName)
    : `Your ${statement.taxYear} Year-End Donation Statement from ${orgName}`;

  const result = await sendWgcEmail({
    to: donor.email,
    subject,
    title: `${statement.taxYear} Year-End Donation Statement`,
    badgeText: "Donation Statement",
    badgeColor: "#0B5DBC",
    bodyHtml: `
      <p>Hello ${donorName},</p>
      <p>Thank you for supporting ${orgName}. Your ${statement.taxYear} Year-End Donation Statement is ready. It summarizes the donations recorded for your account during the calendar year.</p>
      <p>Please review the statement and contact us if you believe any information needs correction.</p>
      <p style="font-size: 12px; color: #94a3b8;">This statement is provided for record-keeping purposes and does not constitute tax advice.</p>
    `,
    attachments: [{ filename: `${statement.taxYear}-donation-statement.pdf`, content: pdf }],
  });

  const resendCount = statement.sentAt ? statement.resendCount + 1 : statement.resendCount;

  await prisma.annualDonationStatement.update({
    where: { id: statement.id },
    data: {
      recipientEmail: donor.email,
      deliveryStatus: result.success ? "SENT" : "FAILED",
      sentAt: result.success ? new Date() : statement.sentAt,
      failureReason: result.success ? null : String((result as any).error ?? "Email send failed"),
      resendCount,
      emailProviderMessageId: result.success ? (result as any).data?.data?.id ?? (result as any).data?.id ?? null : statement.emailProviderMessageId,
    },
  });

  if (!result.success) throw new Error("Failed to send statement email");
  return { recipientEmail: donor.email };
}
