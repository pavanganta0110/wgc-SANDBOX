import "./env";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";

export { prisma };

/** The fixed password used for every seeded merchant/admin test user —
 * never a real credential, just a known value so tests can drive the real
 * /merchant/login and /admin/login forms/API. */
export const E2E_PASSWORD = "E2e-Test-Passw0rd!";

export function randomSuffix(): string {
  return crypto.randomBytes(6).toString("hex");
}

export interface SeededOrg {
  church: Awaited<ReturnType<typeof prisma.church.create>>;
  owner: Awaited<ReturnType<typeof prisma.user.create>>;
}

/**
 * Creates a self-contained test Church + owner User. `billingSetupStatus`
 * mirrors the real gate values from src/lib/billing/accessGate.ts so tests
 * can seed directly into any OrgAccessState without driving a live Finix
 * approval (which cannot be simulated in this environment).
 */
export async function seedOrgWithOwner(opts: {
  namePrefix: string;
  billingSetupStatus?: string | null;
  status?: string;
}): Promise<SeededOrg> {
  const suffix = randomSuffix();
  const name = `${opts.namePrefix} ${suffix}`;
  const slug = `e2e-${opts.namePrefix.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${suffix}`;
  const contactEmail = `owner+${suffix}@e2e.wgcpayments.test`;

  const church = await prisma.church.create({
    data: {
      name,
      slug,
      primaryContactEmail: contactEmail,
      status: opts.status ?? "ACTIVE",
      billingSetupStatus: opts.billingSetupStatus ?? null,
    },
  });

  const passwordHash = await hashPassword(E2E_PASSWORD);
  const owner = await prisma.user.create({
    data: {
      email: contactEmail,
      role: "owner",
      churchId: church.id,
      passwordHash,
    },
  });

  await prisma.church.update({ where: { id: church.id }, data: { primaryOwnerUserId: owner.id } });

  return { church, owner };
}

/** Adds a non-owner sub-user (fundraiser/admin/viewer) to an existing
 * seeded org. */
export async function seedSubUser(churchId: string, role: "admin" | "fundraiser" | "viewer") {
  const suffix = randomSuffix();
  const email = `${role}+${suffix}@e2e.wgcpayments.test`;
  const passwordHash = await hashPassword(E2E_PASSWORD);
  return prisma.user.create({
    data: { email, role, churchId, passwordHash },
  });
}

/** Seeds a WGC internal admin (wgc_super_admin — every billing-admin
 * permission, per src/lib/auth/billingAdminPermissions.ts — so admin tests
 * don't need to also seed a permissionsJson override). */
export async function seedWgcAdmin() {
  const suffix = randomSuffix();
  const email = `admin+${suffix}@e2e.wgcpayments.test`;
  const passwordHash = await hashPassword(E2E_PASSWORD);
  return prisma.user.create({
    data: { email, role: "wgc_super_admin", churchId: null, passwordHash },
  });
}

export async function seedWgcSubscription(params: {
  organizationId: string;
  status: string;
  amountCents?: number;
  finixSubscriptionId?: string | null;
  gracePeriodEndsAt?: Date | null;
  pastDueAt?: Date | null;
  canceledAt?: Date | null;
}) {
  const suffix = randomSuffix();
  const pricing = await prisma.wgcPricingVersion.upsert({
    where: { id: "e2e-fixture-pricing" },
    update: {},
    create: {
      id: "e2e-fixture-pricing",
      planCode: "WGC_STANDARD",
      planName: "WGC Platform",
      monthlyAmountCents: 1000,
      currency: "USD",
      billingInterval: "MONTHLY",
      status: "ACTIVE",
      isDefaultForNewOrgs: false,
    },
  });

  return prisma.wgcSubscription.create({
    data: {
      organizationId: params.organizationId,
      planCode: pricing.planCode,
      priceVersionId: pricing.id,
      finixBillingMerchantId: `e2e-billing-merchant-${suffix}`,
      finixSubscriptionId: params.finixSubscriptionId ?? `SU_e2e_${suffix}`,
      amountCents: params.amountCents ?? 1000,
      status: params.status,
      gracePeriodEndsAt: params.gracePeriodEndsAt ?? null,
      pastDueAt: params.pastDueAt ?? null,
      canceledAt: params.canceledAt ?? null,
    },
  });
}

/**
 * Deletes every row this fixture module (or the flows it drives) may have
 * created for a given organization, in FK-safe order — makes every spec
 * re-runnable without manual DB cleanup. Each delete is independently
 * best-effort (a table with no matching rows is a no-op, never an error).
 */
export async function cleanupOrg(churchId: string | null | undefined) {
  if (!churchId) return;

  const safeDeleteMany = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch {
      // best-effort cleanup only
    }
  };

  await safeDeleteMany(() => prisma.wgcBillingAuditLog.deleteMany({ where: { organizationId: churchId } }));
  await safeDeleteMany(() => prisma.billingCharge.deleteMany({ where: { organizationId: churchId } }));
  await safeDeleteMany(() => prisma.billingActivationToken.deleteMany({ where: { organizationId: churchId } }));
  await safeDeleteMany(() => prisma.billingEmailLog.deleteMany({ where: { organizationId: churchId } }));
  await safeDeleteMany(() => prisma.promotionEntitlement.deleteMany({ where: { organizationId: churchId } }));
  await safeDeleteMany(() => prisma.promotionLead.deleteMany({ where: { organizationId: churchId } }));
  await safeDeleteMany(() => prisma.wgcBillingAccount.deleteMany({ where: { organizationId: churchId } }));
  await safeDeleteMany(() => prisma.wgcSubscription.deleteMany({ where: { organizationId: churchId } }));
  await safeDeleteMany(() => prisma.dashboardAuditLog.deleteMany({ where: { churchId } }));
  await safeDeleteMany(() => prisma.user.deleteMany({ where: { churchId } }));
  await safeDeleteMany(() => prisma.church.delete({ where: { id: churchId } }));
}

/** Cleans up an OnboardingApplication and everything the onboarding /
 * approval flow attaches to it (legal acceptance, associated owners, email
 * logs, and — if approval provisioned one — the resulting Church/User). */
export async function cleanupOnboardingApplication(applicationId: string | null | undefined) {
  if (!applicationId) return;

  const safeDeleteMany = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch {
      // best-effort cleanup only
    }
  };

  const church = await prisma.church.findFirst({ where: { onboardingApplicationId: applicationId } }).catch(() => null);
  if (church) await cleanupOrg(church.id);

  await safeDeleteMany(() => prisma.emailLog.deleteMany({ where: { onboardingApplicationId: applicationId } }));
  await safeDeleteMany(() => prisma.legalAcceptance.deleteMany({ where: { onboardingApplicationId: applicationId } }));
  await safeDeleteMany(() => prisma.associatedOwner.deleteMany({ where: { onboardingApplicationId: applicationId } }));
  await safeDeleteMany(() => prisma.finixWebhookEvent.deleteMany({ where: { merchantId: applicationId } }));
  await safeDeleteMany(() => prisma.onboardingApplication.delete({ where: { id: applicationId } }));
}

export async function cleanupPromotionLeadByToken(rawToken: string | null | undefined) {
  // PromotionLead is keyed by tokenHash, not the raw token — recompute the
  // same hash promotionAttribution.ts uses (sha256) so cleanup can find it
  // without importing an internal, unexported helper.
  if (!rawToken) return;
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  try {
    await prisma.promotionLead.deleteMany({ where: { tokenHash } });
  } catch {
    // best-effort cleanup only
  }
}
