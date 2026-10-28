import { handleDonorSubscriptionRequest, requireIdempotencyKey } from "@/lib/donorPortal/subscriptionRoute";
import { donorUpdateSubscriptionCard, DonorSubscriptionError } from "@/lib/donorPortal/donorSubscriptions";

/** Body carries only an opaque Finix.js token — never raw card data. */
export async function POST(req: Request, { params }: { params: Promise<{ subscriptionId: string }> }) {
  const { subscriptionId } = await params;
  return handleDonorSubscriptionRequest(req, subscriptionId, async (ctx, body) => {
    requireIdempotencyKey(ctx);
    if (body.consentConfirmed !== true) throw new DonorSubscriptionError("Please confirm you authorize the new card.", 400);
    if (typeof body.finixToken !== "string") throw new DonorSubscriptionError("Please re-enter your card details.", 400);
    return { subscription: await donorUpdateSubscriptionCard(ctx, body.finixToken) };
  });
}
