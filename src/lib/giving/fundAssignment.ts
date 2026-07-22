import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Resolves which finixTransferIds match a free-text Fund / Designation
 * search — case-insensitive, partial match against the Payment.fundName
 * snapshot (never the live Fund catalog), so a renamed or archived fund
 * still filters its historical transactions correctly. `paymentScope` is
 * always the caller's buildPaymentScope(auth, viewScope) result — this
 * function never derives churchId/attributedUserId itself, so it can
 * never be tricked into crossing organization or attribution boundaries.
 */
export async function resolveFundFilteredTransferIds(
  paymentScope: Prisma.PaymentWhereInput,
  fundQuery: string
): Promise<string[]> {
  const matches = await prisma.payment.findMany({
    where: { ...paymentScope, fundName: { contains: fundQuery, mode: "insensitive" }, finixTransferId: { not: null } },
    select: { finixTransferId: true },
  });
  return matches.map((m) => m.finixTransferId as string);
}

export interface FundAssignmentInput {
  fundId: string;
  isDefault?: boolean;
  displayOrder?: number;
}

export class FundAssignmentError extends Error {}

/**
 * Validates a set of fund assignments an admin is saving onto a giving
 * link — every fundId must belong to the acting church (never trusted
 * from the client), and at most one may be marked default. Returns the
 * validated rows ready to write; throws FundAssignmentError otherwise.
 * Does not touch GivingLink.fundSelectionEnabled or write anything itself
 * — callers own the actual create/update transaction.
 */
export async function validateFundAssignments(churchId: string, assignments: FundAssignmentInput[]): Promise<FundAssignmentInput[]> {
  if (assignments.length === 0) return [];

  const fundIds = [...new Set(assignments.map((a) => a.fundId))];
  const funds = await prisma.fund.findMany({ where: { id: { in: fundIds }, churchId }, select: { id: true } });
  const validIds = new Set(funds.map((f) => f.id));
  const invalid = fundIds.filter((id) => !validIds.has(id));
  if (invalid.length > 0) {
    throw new FundAssignmentError("One or more selected funds do not belong to this organization");
  }

  const defaultCount = assignments.filter((a) => a.isDefault).length;
  if (defaultCount > 1) {
    throw new FundAssignmentError("Only one fund may be marked as the default");
  }

  return assignments.map((a, i) => ({
    fundId: a.fundId,
    isDefault: !!a.isDefault,
    displayOrder: Number.isInteger(a.displayOrder) ? (a.displayOrder as number) : i,
  }));
}

export interface AssignedActiveFund {
  fundId: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  displayOrder: number;
}

/** Active funds currently assigned to a giving link, in donor-facing
 * dropdown order — archived funds are excluded even if still assigned
 * (an old assignment to a since-archived fund is preserved for admin
 * history, but never offered to a new donor). GivingLinkFund/Fund use
 * plain string FKs (no Prisma @relation), matching this schema's
 * existing convention — batched as two queries, joined in memory. */
export async function loadAssignedActiveFunds(givingLinkId: string): Promise<AssignedActiveFund[]> {
  const assignments = await prisma.givingLinkFund.findMany({
    where: { givingLinkId },
    orderBy: { displayOrder: "asc" },
  });
  if (assignments.length === 0) return [];

  const funds = await prisma.fund.findMany({
    where: { id: { in: assignments.map((a) => a.fundId) }, isActive: true },
    select: { id: true, name: true, description: true },
  });
  const fundMap = new Map(funds.map((f) => [f.id, f]));

  return assignments
    .filter((a) => fundMap.has(a.fundId))
    .map((a) => {
      const fund = fundMap.get(a.fundId)!;
      return { fundId: a.fundId, name: fund.name, description: fund.description, isDefault: a.isDefault, displayOrder: a.displayOrder };
    });
}

/** All fund assignments for a giving link (active and archived funds),
 * for the admin edit form — unlike loadAssignedActiveFunds, this doesn't
 * filter out archived funds, so an admin can see and knowingly remove a
 * stale assignment rather than have it silently vanish from the editor. */
export async function loadAllAssignedFunds(givingLinkId: string) {
  const assignments = await prisma.givingLinkFund.findMany({
    where: { givingLinkId },
    orderBy: { displayOrder: "asc" },
  });
  if (assignments.length === 0) return [];

  const funds = await prisma.fund.findMany({
    where: { id: { in: assignments.map((a) => a.fundId) } },
    select: { id: true, name: true, description: true, isActive: true },
  });
  const fundMap = new Map(funds.map((f) => [f.id, f]));

  return assignments
    .filter((a) => fundMap.has(a.fundId))
    .map((a) => {
      const fund = fundMap.get(a.fundId)!;
      return {
        fundId: a.fundId,
        name: fund.name,
        description: fund.description,
        isActive: fund.isActive,
        isDefault: a.isDefault,
        displayOrder: a.displayOrder,
      };
    });
}

export interface ResolvedDonorFund {
  fundId: string | null;
  fundName: string | null;
}

/**
 * Server-side resolution of which fund a donation is attributed to —
 * never trusts a client-provided fundId without checking it against this
 * specific giving link's active assignments first. This is the only
 * function payment-creation code should call to decide fundId/fundName;
 * it never derives the fund from anything other than the giving link's
 * own assignments plus the church they belong to.
 */
export async function resolveDonorSelectedFund(
  link: { id: string; churchId: string; fundSelectionEnabled: boolean },
  submittedFundId: string | null | undefined
): Promise<ResolvedDonorFund> {
  if (!link.fundSelectionEnabled) {
    return { fundId: null, fundName: null };
  }

  const activeFunds = await loadAssignedActiveFunds(link.id);
  if (activeFunds.length === 0) {
    return { fundId: null, fundName: null };
  }

  if (submittedFundId) {
    const match = activeFunds.find((f) => f.fundId === submittedFundId);
    if (!match) {
      throw new FundAssignmentError("Selected fund is not available for this giving link");
    }
    return { fundId: match.fundId, fundName: match.name };
  }

  if (activeFunds.length === 1) {
    return { fundId: activeFunds[0].fundId, fundName: activeFunds[0].name };
  }

  const defaultFund = activeFunds.find((f) => f.isDefault);
  if (defaultFund) {
    return { fundId: defaultFund.fundId, fundName: defaultFund.name };
  }

  throw new FundAssignmentError("Please select where you'd like your gift to go");
}
