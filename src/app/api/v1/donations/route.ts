import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/api/withApiAuth";
import { apiSuccess, parsePagination, paginationMeta } from "@/lib/api/response";

/** Successful gifts only — see /api/v1/transactions for every payment
 * attempt regardless of outcome. */
export const GET = withApiAuth("donations:read", async (req, auth, requestId) => {
  const { searchParams } = new URL(req.url);
  const { limit, cursor } = parsePagination(searchParams);
  const donorId = searchParams.get("donorId") || undefined;

  const payments = await prisma.payment.findMany({
    where: { churchId: auth.churchId, status: "SUCCEEDED", ...(donorId ? { donorId } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      donorId: true,
      amountCents: true,
      donationAmountCents: true,
      currency: true,
      paymentMethodType: true,
      isAnonymous: true,
      fundName: true,
      givingLinkId: true,
      createdAt: true,
    },
  });

  const { page, hasMore, nextCursor } = paginationMeta(payments, limit);
  return apiSuccess(page, requestId, { hasMore, nextCursor });
});
