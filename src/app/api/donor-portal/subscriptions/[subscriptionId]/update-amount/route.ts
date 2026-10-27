import { handleDonorSubscriptionRequest, requireIdempotencyKey } from "@/lib/donorPortal/subscriptionRoute";
import { donorUpdateSubscriptionAmount, DonorSubscriptionError } from "@/lib/donorPortal/donorSubscriptions";

export async function POST(req: Request, { params }: { params: Promise<{ subscriptionId: string }> }) {
  const { subscriptionId } = await params;
  return handleDonorSubscriptionRequest(req, subscriptionId, async (ctx, body) => {
    requireIdempotencyKey(ctx);
    if (body.consentConfirmed !== true) throw new DonorSubscriptionError("Please confirm the new amount.", 400);
    if (typeof body.newDonationAmountCents !== "number") throw new DonorSubscriptionError("Please enter a valid amount.", 400);
    return { subscription: await donorUpdateSubscriptionAmount(ctx, body.newDonationAmountCents) };
  });
}
