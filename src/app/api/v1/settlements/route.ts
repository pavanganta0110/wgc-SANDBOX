import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/api/withApiAuth";
import { apiSuccess, parsePagination, paginationMeta } from "@/lib/api/response";

export const GET = withApiAuth("settlements:read", async (req, auth, requestId) => {
  const { searchParams } = new URL(req.url);
  const { limit, cursor } = parsePagination(searchParams);

  const settlements = await prisma.finixSettlement.findMany({
    where: { churchId: auth.churchId },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      finixSettlementId: true,
      state: true,
      totalAmountCents: true,
      netAmountCents: true,
      feeAmountCents: true,
      currency: true,
      accruedAt: true,
      settledAt: true,
      createdAt: true,
    },
  });

  const { page, hasMore, nextCursor } = paginationMeta(settlements, limit);
  return apiSuccess(page, requestId, { hasMore, nextCursor });
});
