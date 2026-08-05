import { redirect } from "next/navigation";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { resolveBillingActivationToken } from "@/lib/billing/billingActivation";
import { prisma } from "@/lib/prisma";
import ActivationForm from "@/components/billing/ActivationForm";

export default async function ActivateSubscriptionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect(`/merchant/login?next=/activate-subscription/${token}`);
    throw err;
  }

  const resolved = await resolveBillingActivationToken(token);
  if (!resolved || resolved.organizationId !== auth.churchId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-bold text-slate-900 mb-2">This activation link is invalid or has expired</h1>
          <p className="text-sm text-slate-500 mb-6">Please contact WGC Payments support for a new activation link.</p>
          <a href="mailto:support@wgcpayments.com" className="text-blue-600 font-semibold hover:underline">
            Contact Support
          </a>
        </div>
      </div>
    );
  }

  const [church, existingSubscription, entitlement] = await Promise.all([
    prisma.church.findUnique({ where: { id: auth.churchId } }),
    prisma.wgcSubscription.findUnique({ where: { organizationId: auth.churchId } }),
    prisma.promotionEntitlement.findFirst({ where: { organizationId: auth.churchId, status: "AWAITING_BILLING_SETUP" }, orderBy: { createdAt: "desc" } }),
  ]);

  if (existingSubscription?.finixSubscriptionId) {
    redirect("/merchant/subscription");
  }

  return (
    <ActivationForm
      token={token}
      organizationName={church?.name || "your organization"}
      isPromotional={Boolean(entitlement)}
      durationMonths={entitlement?.durationMonths ?? null}
      regularMonthlyAmountCents={entitlement?.normalMonthlyAmountCents ?? 1000}
    />
  );
}
