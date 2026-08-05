import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { loadDonorAggregates } from "@/lib/donors/donorAggregates";

/**
 * Full before-you-merge comparison: both donor profiles, their lifetime
 * totals (processed vs. external), recurring schedules, notes, and
 * statement history — everything the merge-review modal needs to show a
 * reviewer before they pick which primary/duplicate field values survive.
 */
export async function GET(req: Request, { params }: { params: Promise<{ donorId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const permissions = getDonorPermissions(auth.rawRole);
  if (!permissions.canMerge) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { donorId: primaryDonorId } = await params;
  const { searchParams } = new URL(req.url);
  const duplicateDonorId = searchParams.get("duplicateId");
  if (!duplicateDonorId) return NextResponse.json({ error: "duplicateId is required" }, { status: 400 });

  const [primary, duplicate] = await Promise.all([
    prisma.donor.findFirst({ where: { id: primaryDonorId, churchId: auth.churchId } }),
    prisma.donor.findFirst({ where: { id: duplicateDonorId, churchId: auth.churchId } }),
  ]);
  if (!primary || !duplicate) return NextResponse.json({ error: "Donor not found" }, { status: 404 });

  const [primaryAggregates, duplicateAggregates, primaryNoteCount, duplicateNoteCount, primarySubs, duplicateSubs, primaryStatements, duplicateStatements] = await Promise.all([
    loadDonorAggregates(primaryDonorId, auth.churchId),
    loadDonorAggregates(duplicateDonorId, auth.churchId),
    prisma.donorNote.count({ where: { donorId: primaryDonorId, churchId: auth.churchId } }),
    prisma.donorNote.count({ where: { donorId: duplicateDonorId, churchId: auth.churchId } }),
    prisma.finixSubscription.count({ where: { donorId: primaryDonorId, churchId: auth.churchId, state: "ACTIVE" } }),
    prisma.finixSubscription.count({ where: { donorId: duplicateDonorId, churchId: auth.churchId, state: "ACTIVE" } }),
    prisma.annualDonationStatement.count({ where: { donorId: primaryDonorId, churchId: auth.churchId } }),
    prisma.annualDonationStatement.count({ where: { donorId: duplicateDonorId, churchId: auth.churchId } }),
  ]);

  return NextResponse.json({
    primary: { donor: primary, aggregates: primaryAggregates, noteCount: primaryNoteCount, activeSubscriptions: primarySubs, statementCount: primaryStatements },
    duplicate: { donor: duplicate, aggregates: duplicateAggregates, noteCount: duplicateNoteCount, activeSubscriptions: duplicateSubs, statementCount: duplicateStatements },
  });
}
