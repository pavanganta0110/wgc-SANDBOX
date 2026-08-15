import { prisma } from "@/lib/prisma";
import { provisionChurchAccount } from "@/lib/auth/provisionChurchAccount";
import { sendWgcAdminEmail } from "@/lib/email";

/**
 * Provisions the Church row + church_admin User account for an approved
 * onboarding application, then sets up the WGC platform-billing gate
 * (APPROVED_BILLING_REQUIRED + activation token + activation email).
 *
 * Extracted from the Finix approval webhook handler so the exact same
 * logic can be re-run on demand from the admin UI — provisionChurchAccount
 * itself is idempotent (it looks up an existing Church by
 * onboardingApplicationId before creating one), so calling this again for
 * an application that already has a Church is a safe no-op for the
 * creation step; the billing-gate/activation-email portion always re-runs
 * (harmless — createBillingActivationToken/sendSubscriptionActivationEmail
 * are themselves safe to call again if a merchant needs a fresh link).
 *
 * Never throws for a billing-gate failure (matches the webhook's original
 * behavior — a billing-gate issue must never look like a failed
 * provisioning to the caller); DOES throw if provisionChurchAccount itself
 * fails, since that's the actual thing the caller needs to know about.
 */
export async function provisionChurchAndBillingGate(app: {
  id: string;
  organizationName: string;
  legalBusinessName: string | null;
  contactEmail: string;
  contactName: string;
  finixMerchantId: string | null;
  finixIdentityId: string | null;
  finixApplicationId: string | null;
}) {
  const provisioned = await provisionChurchAccount({
    id: app.id,
    organizationName: app.organizationName,
    legalBusinessName: app.legalBusinessName,
    contactEmail: app.contactEmail,
    contactName: app.contactName,
    finixMerchantId: app.finixMerchantId,
    finixIdentityId: app.finixIdentityId,
    finixApplicationId: app.finixApplicationId,
  });

  try {
    await prisma.church.update({
      where: { id: provisioned.church.id },
      data: { billingSetupStatus: "APPROVED_BILLING_REQUIRED" },
    });

    const { attachPromotionEntitlementIfLeadExists } = await import("@/lib/billing/promotionEntitlement");
    const entitlement = await attachPromotionEntitlementIfLeadExists(app.id, provisioned.church.id);

    const { createBillingActivationToken } = await import("@/lib/billing/billingActivation");
    const rawActivationToken = await createBillingActivationToken(provisioned.church.id);

    const { sendSubscriptionActivationEmail } = await import("@/lib/billing/billingEmails");
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://wgcpayments.com";
    await sendSubscriptionActivationEmail({
      organizationId: provisioned.church.id,
      organizationName: app.organizationName,
      recipientEmail: app.contactEmail,
      activationUrl: `${appUrl}/activate-subscription/${rawActivationToken}`,
    });

    const { logBillingAuditEvent } = await import("@/lib/billing/billingAudit");
    await logBillingAuditEvent({
      organizationId: provisioned.church.id,
      action: "organization.finix_approved",
      entityType: "Church",
      entityId: provisioned.church.id,
      newValue: { billingSetupStatus: "APPROVED_BILLING_REQUIRED" },
      metadata: { onboardingApplicationId: app.id },
    });
    if (entitlement) {
      await logBillingAuditEvent({
        organizationId: provisioned.church.id,
        action: "promotion.attached",
        entityType: "PromotionEntitlement",
        entityId: entitlement.entitlementId,
        metadata: { promotionId: entitlement.promotionId },
      });
    }
    await logBillingAuditEvent({
      organizationId: provisioned.church.id,
      action: "billing.activation_link_created",
      entityType: "Church",
      entityId: provisioned.church.id,
    });
  } catch (billingGateError) {
    console.error("Failed to set up billing-activation gate after approval:", billingGateError);
  }

  return provisioned;
}

/**
 * Same as provisionChurchAndBillingGate, but never throws — instead emails
 * WGC admins so a provisioning failure is never silently lost to a server
 * log nobody reads (spec: previously this was only a console.error, which
 * is how a merchant could get approved in Finix and never receive a Church
 * row — invisible in the Merchants Directory and nobody notified). Used by
 * the webhook handler, where a provisioning failure must never block the
 * approval response back to Finix.
 */
export async function provisionChurchAndBillingGateOrAlert(app: {
  id: string;
  organizationName: string;
  legalBusinessName: string | null;
  contactEmail: string;
  contactName: string;
  finixMerchantId: string | null;
  finixIdentityId: string | null;
  finixApplicationId: string | null;
}) {
  try {
    return await provisionChurchAndBillingGate(app);
  } catch (provisionError) {
    console.error("Failed to provision church dashboard account:", provisionError);
    await sendWgcAdminEmail({
      merchantName: app.legalBusinessName || app.organizationName || "Unknown organization",
      contactEmail: app.contactEmail,
      finixMerchantId: app.finixMerchantId || undefined,
      finixIdentityId: app.finixIdentityId || undefined,
      newStatus: "PROVISIONING_FAILED",
      customSubject: `[WGC Admin] Church provisioning FAILED — ${app.legalBusinessName || app.organizationName || app.contactEmail}`,
      whatHappened: `Finix approved this merchant, but creating its WGC dashboard account (Church row) failed: ${provisionError instanceof Error ? provisionError.message : String(provisionError)}`,
      actionNeeded: `This organization will not appear in the Merchants Directory and cannot access their dashboard until this is fixed. Open Merchant Applications and use "Provision Church Account" to retry, or investigate the error above.`,
      adminDashboardLink: "https://www.wgcpayments.com/admin/merchant-applications",
    }).catch((emailErr) => console.error("Failed to send provisioning-failure admin alert:", emailErr));
    return null;
  }
}
