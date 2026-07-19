import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { findEligibleDonorsForYear, hasMissingStatementInfo } from "@/lib/donors/yearEndStatements";
import { formatPersonName } from "@/lib/formatPersonName";
import { isValidEmail } from "@/lib/donors/donorContact";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";

export async function GET(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const permissions = getDonorPermissions(auth.rawRole);
  if (!permissions.canView) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const taxYear = parseInt(searchParams.get("year") || String(new Date().getFullYear() - 1), 10);
  const statementStatus = searchParams.get("statementStatus") || undefined;
  const deliveryStatus = searchParams.get("deliveryStatus") || undefined;
  const nameQuery = searchParams.get("name") || undefined;
  const missingOnly = searchParams.get("missing") === "1";
  const minAmount = searchParams.get("minAmount") ? Math.round(parseFloat(searchParams.get("minAmount")!) * 100) : undefined;

  const eligible = await findEligibleDonorsForYear(auth.churchId, taxYear);
  const donorIds = eligible.map((e) => e.donorId);
  const eligibleByDonor = new Map(eligible.map((e) => [e.donorId, e]));

  const [donors, statements] = await Promise.all([
    donorIds.length ? prisma.donor.findMany({ where: { id: { in: donorIds }, churchId: auth.churchId } }) : Promise.resolve([]),
    donorIds.length
      ? prisma.annualDonationStatement.findMany({ where: { donorId: { in: donorIds }, churchId: auth.churchId, taxYear, supersededAt: null } })
      : Promise.resolve([]),
  ]);
  const statementByDonor = new Map(statements.map((s) => [s.donorId, s]));

  let rows = donors.map((donor) => {
    const eligibility = eligibleByDonor.get(donor.id)!;
    const statement = statementByDonor.get(donor.id) ?? null;
    const name = donor.anonymousPreference ? "Anonymous Donor" : formatPersonName(donor.name);
    const hasMissingInfo = hasMissingStatementInfo(donor, name, donor.anonymousPreference);
    return {
      donorId: donor.id,
      donorName: name,
      donorEmail: donor.email,
      donationCount: eligibility.donationCount,
      grossDonatedCents: statement?.grossDonatedCents ?? null,
      refundedAmountCents: statement?.refundedAmountCents ?? null,
      returnedAmountCents: statement?.returnedAmountCents ?? null,
      recordedTotalCents: statement?.eligibleAmountCents ?? eligibility.recordedTotalCents,
      statementId: statement?.id ?? null,
      statementVersion: statement?.version ?? 0,
      statementStatus: hasMissingInfo ? "NEEDS_REVIEW" : statement?.statementStatus ?? "NOT_GENERATED",
      deliveryStatus: statement?.deliveryStatus ?? "NOT_SENT",
      generatedAt: statement?.generatedAt ?? null,
      sentAt: statement?.sentAt ?? null,
      hasMissingInfo,
    };
  });

  if (statementStatus) rows = rows.filter((r) => r.statementStatus === statementStatus);
  if (deliveryStatus) rows = rows.filter((r) => r.deliveryStatus === deliveryStatus);
  if (nameQuery) rows = rows.filter((r) => r.donorName.toLowerCase().includes(nameQuery.toLowerCase()));
  if (missingOnly) rows = rows.filter((r) => r.hasMissingInfo);
  if (minAmount != null) rows = rows.filter((r) => r.recordedTotalCents >= minAmount);

  const summary = {
    eligibleDonors: donors.length,
    statementsGenerated: rows.filter((r) => r.statementId).length,
    statementsSent: rows.filter((r) => r.sentAt).length,
    statementsPendingReview: rows.filter((r) => r.statementStatus === "NEEDS_REVIEW").length,
    missingEmail: rows.filter((r) => !r.donorEmail || !isValidEmail(r.donorEmail)).length,
    failedDelivery: rows.filter((r) => r.deliveryStatus === "FAILED").length,
    totalRecordedDonationsCents: rows.reduce((s, r) => s + r.recordedTotalCents, 0),
  };

  return NextResponse.json({ taxYear, rows, summary });
}
