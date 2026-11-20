import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { resolveViewScope } from "@/lib/auth/viewScope";
import { buildRefundScope } from "@/lib/auth/scopes";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { toSafeErrorResponse } from "@/lib/utils/errorNormalizer";
import { sendRefundReceipt } from "@/lib/giving/sendRefundReceipt";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Emails the donor a refund confirmation. Owners and admins only; the refund must be one the caller can see. */
export async function POST(req: Request, { params }: { params: Promise<{ refundId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canViewAllTransactions");
  } catch (err) {
    if (err instanceof ForbiddenError) return toSafeErrorResponse(err.message, 403);
    if (isAuthError(err)) return toSafeErrorResponse(err.message, err.status);
    throw err;
  }

  const { refundId } = await params;
  const viewScope = await resolveViewScope(auth);
  const refundScope = await buildRefundScope(auth, viewScope);
  const refund = await prisma.finixRefundOrReversal.findFirst({
    where: { AND: [{ finixReversalId: refundId }, refundScope] },
    select: { finixReversalId: true },
  });
  if (!refund) return NextResponse.json({ error: "Refund not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const typedEmail = typeof body?.email === "string" ? body.email.trim() : "";
  if (typedEmail && !EMAIL_PATTERN.test(typedEmail)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  try {
    const { sentTo } = await sendRefundReceipt(refund.finixReversalId, auth.churchId, auth.userId, typedEmail ? [typedEmail] : []);
    return NextResponse.json({ success: true, sentTo });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to send refund receipt" }, { status: 400 });
  }
}
