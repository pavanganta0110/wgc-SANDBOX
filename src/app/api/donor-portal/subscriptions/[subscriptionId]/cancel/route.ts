import { handleDonorSubscriptionRequest, requireIdempotencyKey } from "@/lib/donorPortal/subscriptionRoute";
import { donorCancelSubscription } from "@/lib/donorPortal/donorSubscriptions";

export async function POST(req: Request, { params }: { params: Promise<{ subscriptionId: string }> }) {
  const { subscriptionId } = await params;
  return handleDonorSubscriptionRequest(req, subscriptionId, async (ctx, body) => {
    requireIdempotencyKey(ctx);
    const reason = typeof body.reason === "string" ? body.reason : null;
    return { subscription: await donorCancelSubscription(ctx, reason) };
  });
}
