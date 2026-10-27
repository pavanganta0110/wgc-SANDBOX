import { handleDonorSubscriptionRequest } from "@/lib/donorPortal/subscriptionRoute";
import { createDonorPaymentUpdateSetupUrl } from "@/lib/donorPortal/donorSubscriptions";

export async function POST(req: Request, { params }: { params: Promise<{ subscriptionId: string }> }) {
  const { subscriptionId } = await params;
  return handleDonorSubscriptionRequest(req, subscriptionId, async (ctx) => ({ url: await createDonorPaymentUpdateSetupUrl(ctx) }));
}
