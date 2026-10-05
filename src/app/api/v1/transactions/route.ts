import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/api/withApiAuth";
import { apiSuccess, parsePagination, paginationMeta } from "@/lib/api/response";

/** Every payment attempt regardless of status — see /api/v1/donations for
 * successful gifts only. */
export const GET = withApiAuth("transactions:read", async (req, auth, requestId) => {
  const { searchParams } = new URL(req.url);
  const { limit, cursor } = parsePagination(searchParams);
  const status = searchParams.get("status") || undefined;

  const payments = await prisma.payment.findMany({
    where: { churchId: auth.churchId, ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      donorId: true,
      status: true,
      amountCents: true,
      donationAmountCents: true,
      feeCoveredCents: true,
      currency: true,
      paymentMethodType: true,
      failureCode: true,
      failureMessage: true,
      finixTransferId: true,
      createdAt: true,
    },
  });

  const { page, hasMore, nextCursor } = paginationMeta(payments, limit);
  return apiSuccess(page, requestId, { hasMore, nextCursor });
});
