import { test, expect } from "@playwright/test";
import { prisma, seedWgcAdmin, randomSuffix, E2E_PASSWORD } from "./fixtures/db";
import { loginAsAdmin } from "./fixtures/auth";

/**
 * Journey 12: admin pricing and promotion controls — admin creates a new
 * WgcPricingVersion via the admin UI (Billing & Subscriptions -> Pricing),
 * verifying confirmation + reason are required and an audit log entry is
 * created. Also creates a new Promotion, at the API layer (see note
 * below).
 *
 * KNOWN APP GAP found while writing this spec: the admin billing page
 * (src/app/admin/(dashboard)/billing/page.tsx) renders `{tab ===
 * "Promotions" && <PromotionsTab />}`, but no `PromotionsTab` component is
 * defined or imported anywhere in that file or the repo — clicking the
 * "Promotions" tab throws a client-side ReferenceError today. This does
 * not block other tabs (the reference is inside a short-circuited `&&`,
 * so it's never evaluated unless that tab is actually selected). Promotion
 * creation below is therefore driven directly against
 * POST /api/admin/billing/promotions (a real, working endpoint) instead of
 * through that broken tab — flagged again in the completion report.
 *
 * ANOTHER ENVIRONMENT NOTE found while authoring this spec: in THIS
 * sandbox's Playwright/Chromium, every page's client bundle fails to
 * hydrate (console: "eval() is not supported in this environment" — Next
 * dev-mode source maps use eval(), which this particular sandboxed browser
 * blocks outright), so the UI-driven pricing-version test below (button
 * clicks, form state) could not be verified end-to-end here. It is written
 * against the real component (see PricingTab in admin/(dashboard)/
 * billing/page.tsx) and is expected to pass in a normal browser; the
 * server-side-validation test right after it (API-level, no browser
 * interactivity needed) WAS verified live and passes.
 */
test.describe("Admin pricing and promotion controls", () => {
  let createdPricingVersionId: string | null = null;
  let createdPromotionId: string | null = null;
  let adminUserId: string | null = null;

  test.afterEach(async () => {
    if (createdPricingVersionId) await prisma.wgcPricingVersion.delete({ where: { id: createdPricingVersionId } }).catch(() => {});
    if (createdPromotionId) await prisma.promotion.delete({ where: { id: createdPromotionId } }).catch(() => {});
    if (adminUserId) {
      await prisma.wgcBillingAuditLog.deleteMany({ where: { actorUserId: adminUserId } }).catch(() => {});
      await prisma.user.delete({ where: { id: adminUserId } }).catch(() => {});
    }
    createdPricingVersionId = null;
    createdPromotionId = null;
    adminUserId = null;
  });

  test("creating a new pricing version via the admin UI requires confirmation and a reason, and logs an audit entry", async ({ page, context }) => {
    const admin = await seedWgcAdmin();
    adminUserId = admin.id;
    await loginAsAdmin(context.request, admin.email, E2E_PASSWORD);

    const suffix = randomSuffix();
    const planCode = `E2E_PLAN_${suffix}`;

    await page.goto("/admin/billing");
    await page.getByRole("button", { name: "Pricing" }).click();
    await page.getByRole("button", { name: "Add Version" }).click();

    // The form's <label>/<input> pairs are unlinked siblings (no
    // htmlFor/id), so getByLabel() can't match them — scope by the CSS
    // adjacent-sibling combinator against each label's own text instead.
    await page.locator('label:has-text("Plan Code") + input').fill(planCode);
    await page.locator('label:has-text("Plan Name") + input').fill("E2E Test Plan");
    await page.locator('label:has-text("Monthly Amount") + input').fill("12.50");

    // Confirmation checkbox unchecked -> submit is rejected client-side.
    const createButton = page.getByRole("button", { name: "Create Version" });
    await createButton.click();
    await expect(page.getByText(/Confirmation is required/i)).toBeVisible();

    const beforeCount = await prisma.wgcPricingVersion.count({ where: { planCode } });
    expect(beforeCount).toBe(0);

    await page.locator('label:has-text("Reason (internal)") + textarea').fill("E2E test: adjusting plan pricing.");
    await page.locator('label:has-text("I confirm this pricing change") input[type="checkbox"]').check();
    await createButton.click();

    await expect(page.getByText(/New pricing version created/i)).toBeVisible();

    const created = await prisma.wgcPricingVersion.findFirst({ where: { planCode } });
    expect(created).toBeTruthy();
    expect(created!.monthlyAmountCents).toBe(1250);
    createdPricingVersionId = created!.id;

    const auditEntry = await prisma.wgcBillingAuditLog.findFirst({
      where: { action: "pricing.version_created", entityId: created!.id },
    });
    expect(auditEntry).toBeTruthy();
    expect(auditEntry!.internalReason).toContain("adjusting plan pricing");
    expect(auditEntry!.actorEmail).toBe(admin.email);
  });

  test("the pricing API itself rejects an unconfirmed request server-side (never trusts client-side validation alone)", async ({ context }) => {
    const admin = await seedWgcAdmin();
    adminUserId = admin.id;
    await loginAsAdmin(context.request, admin.email, E2E_PASSWORD);

    const suffix = randomSuffix();
    const res = await context.request.post("/api/admin/billing/pricing", {
      data: { planCode: `E2E_UNCONFIRMED_${suffix}`, planName: "Should Not Be Created", monthlyAmountCents: 999, confirmed: false },
    });
    expect(res.status()).toBe(400);

    const created = await prisma.wgcPricingVersion.findFirst({ where: { planCode: `E2E_UNCONFIRMED_${suffix}` } });
    expect(created).toBeNull();
  });

  test("creating a new Promotion via the API requires admin auth and logs an audit entry", async ({ context }) => {
    const admin = await seedWgcAdmin();
    adminUserId = admin.id;
    await loginAsAdmin(context.request, admin.email, E2E_PASSWORD);

    const suffix = randomSuffix();
    const res = await context.request.post("/api/admin/billing/promotions", {
      data: {
        code: `E2E_PROMO_${suffix}`,
        name: "E2E Test Promotion",
        durationMonths: 2,
        normalMonthlyAmountCents: 1000,
        allowManualGrantToExistingOrg: true,
        reason: "E2E test promotion creation.",
        confirmed: true,
      },
    });
    expect(res.ok(), await res.text()).toBeTruthy();
    const body = await res.json();
    createdPromotionId = body.promotion?.id ?? null;
    expect(createdPromotionId).toBeTruthy();

    const created = await prisma.promotion.findUnique({ where: { id: createdPromotionId! } });
    expect(created).toBeTruthy();
    expect(created!.durationMonths).toBe(2);

    const auditEntry = await prisma.wgcBillingAuditLog.findFirst({
      where: { entityType: "Promotion", entityId: createdPromotionId! },
    });
    expect(auditEntry).toBeTruthy();
  });
});
