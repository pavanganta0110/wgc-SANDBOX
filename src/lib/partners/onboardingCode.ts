import crypto from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * The code in a partner's Get Started links. It only tags an application with the
 * partner; it never approves anything or exposes data. Generated on first use so
 * existing partners need no migration.
 */

export function generateOnboardingCode(): string {
  return `ob_${crypto.randomBytes(18).toString("base64url")}`;
}

export function looksLikeOnboardingCode(value: unknown): value is string {
  return typeof value === "string" && /^ob_[A-Za-z0-9_-]{20,40}$/.test(value);
}

/** The partner's code, creating it the first time. */
export async function ensureOnboardingCode(partnerId: string): Promise<string> {
  const existing = await prisma.partner.findUnique({ where: { id: partnerId }, select: { onboardingCode: true } });
  if (existing?.onboardingCode) return existing.onboardingCode;

  const code = generateOnboardingCode();
  // Only fills it when still empty, so two requests racing don't replace each other's code.
  await prisma.partner.updateMany({ where: { id: partnerId, onboardingCode: null }, data: { onboardingCode: code } });
  const after = await prisma.partner.findUnique({ where: { id: partnerId }, select: { onboardingCode: true } });
  if (!after?.onboardingCode) throw new Error("Partner not found.");
  return after.onboardingCode;
}

/** The active partner behind a code, or null. A bad code never blocks an application; it just isn't tagged. */
export async function resolvePartnerByOnboardingCode(code: unknown): Promise<{ id: string; suppressMerchantEmails: boolean } | null> {
  if (!looksLikeOnboardingCode(code)) return null;
  const partner = await prisma.partner.findUnique({
    where: { onboardingCode: code },
    select: { id: true, status: true, suppressMerchantEmails: true },
  });
  if (!partner || partner.status !== "ACTIVE") return null;
  return { id: partner.id, suppressMerchantEmails: partner.suppressMerchantEmails };
}

/** Whether WGC should hold back its own emails to the organization for this application. */
export async function partnerSuppressesMerchantEmails(partnerId: string | null | undefined): Promise<boolean> {
  if (!partnerId) return false;
  const partner = await prisma.partner.findUnique({ where: { id: partnerId }, select: { suppressMerchantEmails: true } });
  return partner?.suppressMerchantEmails === true;
}
