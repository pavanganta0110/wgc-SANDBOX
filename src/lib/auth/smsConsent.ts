import { prisma } from "@/lib/prisma";
import { SMS_2FA_CONSENT_TEXT_VERSION } from "@/lib/auth/smsConsentText";

/** Records a consent grant — called once, server-side, at the moment
 * enrollment is confirmed (never trusts a client-submitted "consented"
 * flag without this being the thing that actually wrote it). Never logs
 * the phone number itself — only ids, matching this codebase's "no
 * sensitive data in logs" convention. */
export async function recordSmsConsentGranted(input: { userId: string; churchId: string | null; phone: string; source: string }) {
  await prisma.smsConsentEvent.create({
    data: {
      userId: input.userId,
      churchId: input.churchId,
      phone: input.phone,
      eventType: "GRANTED",
      consentSource: input.source,
      consentTextVersion: SMS_2FA_CONSENT_TEXT_VERSION,
    },
  });
}

export async function recordSmsConsentWithdrawn(input: { userId: string; churchId: string | null; phone: string; source: string }) {
  await prisma.smsConsentEvent.create({
    data: {
      userId: input.userId,
      churchId: input.churchId,
      phone: input.phone,
      eventType: "WITHDRAWN",
      consentSource: input.source,
      consentTextVersion: SMS_2FA_CONSENT_TEXT_VERSION,
    },
  });
}
