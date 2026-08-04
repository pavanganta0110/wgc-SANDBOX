import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { toSafeErrorResponse } from "@/lib/utils/errorNormalizer";
import { buildCsvExport, csvResponse, sanitizeCsvFormulaValue } from "@/lib/csvExport";
import { loadExternalDonationsForExport } from "@/lib/donations/externalDonationsList";
import { resolveExternalDonationScopedUserId } from "@/lib/donations/externalDonationScope";
import { EXTERNAL_PAYMENT_METHOD_LABELS, receiptStatusLabel, type ExternalPaymentMethod } from "@/lib/donations/externalDonationTypes";
import { resolveDateRange } from "@/lib/dateRangePresets";

function safe(value: string): string {
  return sanitizeCsvFormulaValue(value);
}

export async function GET(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canExportExternalDonations");
  } catch (err) {
    if (isAuthError(err)) return toSafeErrorResponse(err.message, err.status);
    throw err;
  }

  const { searchParams } = new URL(req.url);
  const scopedUserId = await resolveExternalDonationScopedUserId(auth);
  const { from, to } = resolveDateRange(searchParams.get("range") || undefined, searchParams.get("from") || undefined, searchParams.get("to") || undefined);

  const rows = await loadExternalDonationsForExport(auth.churchId, {
    search: searchParams.get("q") || undefined,
    paymentMethod: searchParams.get("method") || undefined,
    receiptStatus: searchParams.get("receiptStatus") || undefined,
    isTaxDeductible: searchParams.get("deductible") === "yes" ? true : searchParams.get("deductible") === "no" ? false : undefined,
    addedByUserId: searchParams.get("addedBy") || undefined,
    importedOnly: searchParams.get("source") === "imported",
    manualOnly: searchParams.get("source") === "manual",
    donationDateFrom: from || undefined,
    donationDateTo: to || undefined,
    scopedToUserId: scopedUserId || undefined,
    includeVoided: searchParams.get("includeVoided") === "1",
  });

  const donorIds = [...new Set(rows.map((r) => r.donorId).filter((id): id is string => Boolean(id)))];
  const userIds = [...new Set(rows.map((r) => r.createdByUserId).filter((id): id is string => Boolean(id)))];
  const [donors, users] = await Promise.all([
    donorIds.length ? prisma.donor.findMany({ where: { id: { in: donorIds } }, select: { id: true, name: true, email: true } }) : [],
    userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } }) : [],
  ]);
  const donorById = new Map(donors.map((d) => [d.id, d]));
  const userById = new Map(users.map((u) => [u.id, u]));

  const csv = buildCsvExport(rows, [
    {
      header: "Donor Name",
      value: (r) => safe(r.isAnonymous ? "Anonymous" : r.donorId ? donorById.get(r.donorId)?.name || "" : ""),
    },
    { header: "Donor Email", value: (r) => safe(r.isAnonymous ? "" : r.donorId ? donorById.get(r.donorId)?.email || "" : "") },
    { header: "Amount", value: (r) => (r.donationAmountCents / 100).toFixed(2) },
    { header: "Donation Date", value: (r) => r.donationDate.toISOString().slice(0, 10) },
    { header: "Payment Method", value: (r) => safe(r.paymentMethod === "OTHER" ? r.otherPaymentMethodName || "Other" : EXTERNAL_PAYMENT_METHOD_LABELS[r.paymentMethod as ExternalPaymentMethod] || r.paymentMethod) },
    { header: "Fund", value: (r) => safe(r.fundName || "") },
    { header: "Campaign", value: (r) => safe(r.campaign || "") },
    { header: "Reference Number", value: (r) => safe(r.externalTransactionId || r.confirmationNumber || r.checkNumber || "") },
    { header: "Status", value: (r) => safe(r.status) },
    { header: "Receipt Status", value: (r) => safe(receiptStatusLabel(r.receiptStatus)) },
    { header: "Tax Deductible", value: (r) => (r.isTaxDeductible ? "Yes" : "No") },
    { header: "Deductible Amount", value: (r) => (r.deductibleAmountCents != null ? (r.deductibleAmountCents / 100).toFixed(2) : "") },
    { header: "Goods or Services Provided", value: (r) => (r.goodsOrServicesProvided ? "Yes" : "No") },
    { header: "Added By", value: (r) => safe(r.createdByUserId ? userById.get(r.createdByUserId)?.email || "" : "") },
    { header: "Source", value: (r) => (r.importBatchId ? "Imported" : "Manual") },
    { header: "Date Entered", value: (r) => r.createdAt.toISOString() },
  ]);

  return csvResponse(csv, `external-donations-${new Date().toISOString().slice(0, 10)}.csv`);
}
