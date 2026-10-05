import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/api/withApiAuth";
import { apiSuccess, apiError, parsePagination, paginationMeta } from "@/lib/api/response";
import { generatePublicSlug } from "@/lib/givingLinks/validation";
import { DEFAULT_DONOR_FIELD_SETTINGS } from "@/lib/givingLinks/types";

function toPublicGivingLink(link: { id: string; publicSlug: string; internalName: string; publicTitle: string; status: string; totalCollectedCents: number; refundedCents: number; returnedCents: number; successfulDonations: number; createdAt: Date }) {
  return {
    id: link.id,
    publicSlug: link.publicSlug,
    url: `https://www.wgcpayments.com/g/${link.publicSlug}`,
    internalName: link.internalName,
    publicTitle: link.publicTitle,
    status: link.status,
    netCollectedCents: link.totalCollectedCents - link.refundedCents - link.returnedCents,
    successfulDonations: link.successfulDonations,
    createdAt: link.createdAt,
  };
}

export const GET = withApiAuth("giving-links:read", async (req, auth, requestId) => {
  const { searchParams } = new URL(req.url);
  const { limit, cursor } = parsePagination(searchParams);
  const status = searchParams.get("status") || undefined;

  const links = await prisma.givingLink.findMany({
    where: { churchId: auth.churchId, ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const { page, hasMore, nextCursor } = paginationMeta(links, limit);
  return apiSuccess(page.map(toPublicGivingLink), requestId, { hasMore, nextCursor });
});

export const POST = withApiAuth("giving-links:write", async (req, auth, requestId) => {
  const body = await req.json().catch(() => ({}));
  const { internalName, publicTitle, fixedAmountCents } = body;

  if (!internalName || typeof internalName !== "string" || !internalName.trim()) {
    return apiError("validation_error", "`internalName` is required.", requestId);
  }
  if (!publicTitle || typeof publicTitle !== "string" || !publicTitle.trim()) {
    return apiError("validation_error", "`publicTitle` is required.", requestId);
  }

  let publicSlug = generatePublicSlug();
  for (let attempt = 0; attempt < 5; attempt++) {
    if (!(await prisma.givingLink.findUnique({ where: { publicSlug } }))) break;
    publicSlug = generatePublicSlug();
  }

  const amountType = typeof fixedAmountCents === "number" && fixedAmountCents > 0 ? "FIXED" : "VARIABLE";

  const link = await prisma.givingLink.create({
    data: {
      churchId: auth.churchId,
      publicSlug,
      internalName: internalName.trim(),
      publicTitle: publicTitle.trim(),
      status: "ACTIVE",
      amountType,
      fixedAmountCents: amountType === "FIXED" ? fixedAmountCents : null,
      allowCustomAmount: amountType === "VARIABLE",
      suggestedAmountsJson: [2500, 5000, 10000, 25000],
      linkType: "MULTI_USE",
      allowedPaymentMethodsJson: ["CARD", "BANK", "APPLE_PAY", "GOOGLE_PAY"],
      donorFieldSettingsJson: DEFAULT_DONOR_FIELD_SETTINGS,
      feeCoverEnabled: true,
      feeCoverDefaultOn: true,
    },
  });

  return apiSuccess(toPublicGivingLink(link), requestId);
});
