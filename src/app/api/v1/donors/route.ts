import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/api/withApiAuth";
import { apiSuccess, apiError, parsePagination, paginationMeta } from "@/lib/api/response";
import { findIdempotentReplay, storeIdempotentResponse } from "@/lib/api/idempotency";
import { emitEvent } from "@/lib/events/emitEvent";

function toPublicDonor(d: { id: string; name: string | null; email: string | null; phone: string | null; createdAt: Date; updatedAt: Date; anonymousPreference: boolean }) {
  return { id: d.id, name: d.name, email: d.email, phone: d.phone, anonymousPreference: d.anonymousPreference, createdAt: d.createdAt, updatedAt: d.updatedAt };
}

export const GET = withApiAuth("donors:read", async (req, auth, requestId) => {
  const { searchParams } = new URL(req.url);
  const { limit, cursor } = parsePagination(searchParams);

  const donors = await prisma.donor.findMany({
    where: { churchId: auth.churchId, archivedAt: null },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const { page, hasMore, nextCursor } = paginationMeta(donors, limit);
  return apiSuccess(page.map(toPublicDonor), requestId, { hasMore, nextCursor });
});

export const POST = withApiAuth("donors:write", async (req, auth, requestId) => {
  const idempotencyKey = req.headers.get("idempotency-key");
  const path = new URL(req.url).pathname;
  if (idempotencyKey) {
    const replay = await findIdempotentReplay(auth.apiKeyId, idempotencyKey, "POST", path);
    if (replay) return replay;
  }

  const body = await req.json().catch(() => ({}));
  const { name, email, phone } = body;
  if (!name || typeof name !== "string" || !name.trim()) {
    return apiError("validation_error", "`name` is required.", requestId);
  }

  const donor = await prisma.donor.create({
    data: {
      churchId: auth.churchId,
      name: name.trim(),
      email: typeof email === "string" ? email.trim() : null,
      normalizedEmail: typeof email === "string" ? email.trim().toLowerCase() : null,
      phone: typeof phone === "string" ? phone.trim() : null,
    },
  });

  try {
    await emitEvent({ type: "donor.created", churchId: auth.churchId, data: { donorId: donor.id, name: donor.name, email: donor.email, source: "api" } });
  } catch (err) {
    console.error("Failed to emit donor.created event (API):", err);
  }

  const response = apiSuccess(toPublicDonor(donor), requestId);
  if (idempotencyKey) {
    const bodyForCache = await response.clone().json();
    await storeIdempotentResponse(auth.apiKeyId, idempotencyKey, "POST", path, response.status, bodyForCache);
  }
  return response;
});
