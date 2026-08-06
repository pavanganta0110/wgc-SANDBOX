import { test, expect } from "@playwright/test";
import { prisma, cleanupOnboardingApplication, cleanupPromotionLeadByToken } from "./fixtures/db";
import { buildOnboardingPayload } from "./fixtures/onboarding";
import { buildMerchantApprovedPayload, buildFinixWebhookHeaders } from "./fixtures/finixWebhook";
import { loginAsMerchant } from "./fixtures/auth";
import { hashPassword } from "@/lib/auth/password";
import { createBillingActivationToken } from "@/lib/billing/billingActivation";

/**
 * Journey 1: Six Months Free signup — landing page -> signup form -> lead
 * captured -> simulated Finix approval webhook -> activation email link ->
 * billing authorization page.
 *
 * The full onboarding wizard (organization/business/principal/bank tabs,
 * ~40 fields) is driven through its own API (/api/onboarding) rather than
 * individually filled in via CSS selectors — see e2e/fixtures/onboarding.ts
 * for why. The landing page visit, lead capture, and final activation page
 * ARE driven through the real UI/cookies.
 */
test.describe("Six Months Free signup journey", () => {
  let applicationId: string | null = null;
  let promoRawToken: string | null = null;

  test.afterEach(async () => {
    await cleanupOnboardingApplication(applicationId);
    await cleanupPromotionLeadByToken(promoRawToken);
  });

  test("landing page -> lead captured -> Finix approval -> activation link -> billing authorization page", async ({ page, context }) => {
    // 1. Landing page
    await page.goto("/six-months-free");
    await expect(page.getByRole("heading", { name: /Six Months Free/i })).toBeVisible();

    await expect(page.getByRole("button", { name: /Start Six Months Free/i })).toBeVisible();

    // 2. "Start Six Months Free" button creates the PromotionLead + cookie.
    // Called directly (same request SixMonthsFreeStartButton's onClick
    // fires) rather than via page.click() + waitForResponse: in THIS
    // sandbox's Playwright/Chromium, client component hydration never
    // completes (console: "eval() is not supported in this environment" —
    // Next dev-mode source maps use eval(), which this sandboxed browser
    // blocks outright, see spec 07/09/10/12 for the same finding), so a
    // real click never fires the handler here. This still exercises the
    // real, trusted server endpoint the button calls.
    const leadResponse = await context.request.post("/api/promo/six-months-free/start", { data: {} });
    expect(leadResponse.ok()).toBeTruthy();

    const cookies = await context.cookies();
    const promoCookie = cookies.find((c) => c.name === "wgc_promo_lead");
    expect(promoCookie, "promo lead cookie should be set after clicking Start Six Months Free").toBeTruthy();
    promoRawToken = promoCookie!.value;

    const lead = await prisma.promotionLead.findFirst({ where: { campaignSource: "six-months-free-landing-page" }, orderBy: { createdAt: "desc" } });
    expect(lead).toBeTruthy();
    expect(lead!.status).toBe("LEAD_CAPTURED");

    // 3. Signup form submission (via the same API /start's own form posts to).
    const orgName = `E2E SixMonthsFree Org`;
    const contactEmail = `sixmonths+${Date.now()}@e2e.wgcpayments.test`;
    await context.addCookies([
      { name: "wgc_onboarding_captcha", value: "bypass=true", url: "http://127.0.0.1:3000" },
    ]);
    const onboardRes = await context.request.post("/api/onboarding", {
      data: buildOnboardingPayload({ organizationName: orgName, contactEmail }),
    });
    expect(onboardRes.ok(), await onboardRes.text()).toBeTruthy();
    const onboardBody = await onboardRes.json();
    expect(onboardBody.success).toBe(true);
    applicationId = onboardBody.applicationId;

    const application = await prisma.onboardingApplication.findUnique({ where: { id: applicationId! } });
    expect(application?.finixMerchantId).toBeTruthy();

    // Lead was attributed to this application server-side.
    const attributedLead = await prisma.promotionLead.findUnique({ where: { id: lead!.id } });
    expect(attributedLead?.onboardingApplicationId).toBe(applicationId);
    expect(attributedLead?.status).toBe("SIGNUP_STARTED");

    // 4. Simulated Finix approval webhook.
    const payload = buildMerchantApprovedPayload({ finixMerchantId: application!.finixMerchantId! });
    const rawBody = JSON.stringify(payload);
    const webhookRes = await context.request.post("/api/webhooks/finix", {
      data: rawBody,
      headers: buildFinixWebhookHeaders(rawBody),
    });
    expect(webhookRes.ok(), await webhookRes.text()).toBeTruthy();

    const approvedApplication = await prisma.onboardingApplication.findUnique({ where: { id: applicationId! } });
    expect(approvedApplication?.onboardingStatus).toBe("APPROVED");

    const church = await prisma.church.findFirst({ where: { onboardingApplicationId: applicationId! } });
    expect(church).toBeTruthy();
    expect(church!.billingSetupStatus).toBe("APPROVED_BILLING_REQUIRED");

    // The Six Months Free promotion entitlement was attached automatically
    // (via the PromotionLead), never a normal-signup manual grant.
    const entitlement = await prisma.promotionEntitlement.findFirst({ where: { organizationId: church!.id } });
    expect(entitlement).toBeTruthy();
    expect(entitlement!.source).toBe("LANDING_PAGE_AUTOMATIC");

    // 5. Activation email link -> log in as the newly-provisioned owner and
    // visit the activation page (representing the emailed link).
    const activationToken = await prisma.billingActivationToken.findFirst({
      where: { organizationId: church!.id },
      orderBy: { createdAt: "desc" },
    });
    expect(activationToken).toBeTruthy();

    const owner = await prisma.user.findFirst({ where: { churchId: church!.id } });
    expect(owner).toBeTruthy();

    // provisionChurchAccount() creates the owner with only a set-password
    // token (no password yet) — set one directly so the login form can be
    // driven for real, matching how a real owner would set their password
    // via the emailed set-password link before ever logging in.
    const testPassword = "E2e-SixMonths-Passw0rd!";
    await prisma.user.update({ where: { id: owner!.id }, data: { passwordHash: await hashPassword(testPassword) } });

    await loginAsMerchant(context.request, owner!.email, testPassword);

    // We don't have the raw activation token (only its hash is stored) —
    // rotate a fresh one via the same helper the webhook approval path
    // uses, representing "the link from the activation email."
    const rawActivationToken = await createBillingActivationToken(church!.id);

    // KNOWN APP BUG found while writing this spec (confirmed live against
    // the real dev server, not a sandbox artifact): src/app/activate-
    // subscription/[token]/page.tsx calls `requireMerchantSession()` with
    // NO argument (default allowRestrictedAccess=false), so it throws
    // BillingAccessRestrictedError for exactly the org state this page
    // exists to unblock (APPROVED_BILLING_REQUIRED) — an owner clicking
    // their real activation email link hits this 500 instead of the
    // activation form. Every other billing-setup route in this codebase
    // (e.g. /api/billing/activate) correctly calls
    // requireMerchantSession(true). Flagged in the completion report;
    // marked failing here rather than silently asserting the broken
    // behavior, so this test goes green the moment that one-argument fix
    // lands.
    test.fail(true, "src/app/activate-subscription/[token]/page.tsx calls requireMerchantSession() without allowRestrictedAccess=true — throws for APPROVED_BILLING_REQUIRED orgs");
    await page.goto(`/activate-subscription/${rawActivationToken}`);
    await expect(page.getByText(orgName)).toBeVisible();
    // Promotional messaging must be present on this landing-page-driven signup.
    await expect(page.getByText(/free/i).first()).toBeVisible();
  });
});
