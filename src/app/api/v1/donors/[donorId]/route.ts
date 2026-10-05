import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/api/withApiAuth";
import { apiSuccess, apiError } from "@/lib/api/response";
import { emitEvent } from "@/lib/events/emitEvent";

function toPublicDonor(d: { id: string; name: string | null; email: string | null; phone: string | null; createdAt: Date; updatedAt: Date; anonymousPreference: boolean }) {
  return { id: d.id, name: d.name, email: d.email, phone: d.phone, anonymousPreference: d.anonymousPreference, createdAt: d.createdAt, updatedAt: d.updatedAt };
}

export const GET = withApiAuth<{ params: Promise<{ donorId: string }> }>("donors:read", async (req, auth, requestId, { params }) => {
  const { donorId } = await params;

  const donor = await prisma.donor.findFirst({ where: { id: donorId, churchId: auth.churchId } });
  if (!donor) return apiError("not_found_error", "Donor not found.", requestId);

  return apiSuccess(toPublicDonor(donor), requestId);
});

export const PATCH = withApiAuth<{ params: Promise<{ donorId: string }> }>("donors:write", async (req, auth, requestId, { params }) => {
  const { donorId } = await params;

  const existing = await prisma.donor.findFirst({ where: { id: donorId, churchId: auth.churchId } });
  if (!existing) return apiError("not_found_error", "Donor not found.", requestId);

  const body = await req.json().catch(() => ({}));
  const { name, email, phone } = body;

  const updated = await prisma.donor.update({
    where: { id: donorId },
    data: {
      ...(name !== undefined ? { name: typeof name === "string" ? name.trim() : null } : {}),
      ...(email !== undefined ? { email: typeof email === "string" ? email.trim() : null, normalizedEmail: typeof email === "string" ? email.trim().toLowerCase() : null } : {}),
      ...(phone !== undefined ? { phone: typeof phone === "string" ? phone.trim() : null } : {}),
    },
  });

  try {
    await emitEvent({ type: "donor.updated", churchId: auth.churchId, data: { donorId: updated.id, changedFields: Object.keys(body), source: "api" } });
  } catch (err) {
    console.error("Failed to emit donor.updated event (API):", err);
  }

  return apiSuccess(toPublicDonor(updated), requestId);
});
