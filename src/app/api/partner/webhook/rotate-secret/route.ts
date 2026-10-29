import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { isAuthError } from "@/lib/auth/errors";
import { requirePartnerSession } from "@/lib/partners/partnerSession";
import { generateSigningSecret } from "@/lib/webhooks/signing";
import { encryptSecret, serializeEnvelope } from "@/lib/webhooks/encryption";

/** A new signing secret, shown once. The old one stops verifying right away. */
export async function POST() {
  try {
    const session = await requirePartnerSession();
    const secret = generateSigningSecret();
    const result = await prisma.partnerWebhookEndpoint.updateMany({
      where: { partnerId: session.partnerId },
      data: { signingSecretEncrypted: serializeEnvelope(encryptSecret(secret)), signingSecretLast4: secret.slice(-4) },
    });
    if (result.count !== 1) return NextResponse.json({ error: "No webhook is set up yet." }, { status: 404 });
    await createAuditLog({ action: "PARTNER_WEBHOOK_SECRET_ROTATED", actorEmail: session.email, metadata: { partnerId: session.partnerId } });
    return NextResponse.json({ signingSecret: secret });
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
