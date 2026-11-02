import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";

/**
 * The signed-in organization's payment-processor-mode settings, for client
 * forms (Take a Payment) that need to know the wording and whether to offer
 * the term field, plus term suggestions: the current student term and every
 * term already used on a payment. The org id always comes from the session.
 */
export async function GET() {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const church = await prisma.church.findUnique({
    where: { id: auth.churchId },
    select: { paymentMode: true, termFieldEnabled: true, studentCurrentTerm: true },
  });
  if (!church) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

  let terms: string[] = [];
  if (church.termFieldEnabled) {
    const used = await prisma.payment.findMany({
      where: { churchId: auth.churchId, studentTermLabel: { not: null } },
      distinct: ["studentTermLabel"],
      select: { studentTermLabel: true },
      take: 100,
    });
    terms = [...new Set([church.studentCurrentTerm, ...used.map((p) => p.studentTermLabel)].filter((t): t is string => !!t))]
      .sort()
      .reverse();
  }

  return NextResponse.json({
    paymentMode: church.paymentMode,
    termFieldEnabled: church.termFieldEnabled,
    currentTerm: church.studentCurrentTerm,
    terms,
  });
}
