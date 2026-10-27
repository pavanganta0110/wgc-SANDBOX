import { NextResponse } from "next/server";
import { requireDonorSession, DonorAuthError, type DonorSession } from "@/lib/donorPortal/donorAuth";
import { DonorSubscriptionError, type DonorActionContext } from "@/lib/donorPortal/donorSubscriptions";

/**
 * Shared shell for the donor-portal subscription routes: resolves the donor
 * session from the body's org slug (never a client churchId), builds the
 * action context, and maps errors to JSON. Auth errors are always a plain 401.
 */
export async function handleDonorSubscriptionRequest(
  req: Request,
  subscriptionId: string,
  run: (ctx: DonorActionContext, body: Record<string, unknown>, session: DonorSession) => Promise<unknown>,
): Promise<NextResponse> {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const slug = typeof body.slug === "string" ? body.slug : "";

  let session: DonorSession;
  try {
    session = await requireDonorSession(slug);
  } catch (err) {
    if (err instanceof DonorAuthError) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    throw err;
  }

  const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey : "";
  const ctx: DonorActionContext = {
    churchId: session.churchId,
    sessionDonorId: session.donorId,
    subscriptionId,
    idempotencyKey,
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0].trim() || null,
    userAgent: req.headers.get("user-agent"),
  };

  try {
    return NextResponse.json(await run(ctx, body, session));
  } catch (err) {
    if (err instanceof DonorSubscriptionError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("Donor portal subscription action failed:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

export function requireIdempotencyKey(ctx: DonorActionContext): void {
  if (!ctx.idempotencyKey || ctx.idempotencyKey.length > 100) throw new DonorSubscriptionError("A valid idempotencyKey is required.", 400);
}
