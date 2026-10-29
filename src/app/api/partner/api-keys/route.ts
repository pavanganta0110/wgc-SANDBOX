import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { isAuthError } from "@/lib/auth/errors";
import { requirePartnerSession } from "@/lib/partners/partnerSession";
import { generatePartnerApiKey, hashPartnerApiKey, partnerKeyEnvironment, partnerKeyPrefixFor, MAX_ACTIVE_PARTNER_KEYS } from "@/lib/partners/partnerApiKeys";

export async function GET() {
  try {
    const session = await requirePartnerSession();
    const keys = await prisma.partnerApiKey.findMany({
      where: { partnerId: session.partnerId },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, keyPrefix: true, status: true, createdAt: true, lastUsedAt: true, revokedAt: true, requestCount: true },
    });
    return NextResponse.json({ keys, environment: partnerKeyEnvironment() === "live" ? "Production" : "Sandbox" });
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

export async function POST(req: Request) {
  try {
    const session = await requirePartnerSession();
    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
    if (!name) return NextResponse.json({ error: "Give the key a name, for example the system that will use it." }, { status: 400 });

    const active = await prisma.partnerApiKey.count({ where: { partnerId: session.partnerId, status: "ACTIVE" } });
    if (active >= MAX_ACTIVE_PARTNER_KEYS) {
      return NextResponse.json({ error: `You can have at most ${MAX_ACTIVE_PARTNER_KEYS} active keys. Revoke one first.` }, { status: 409 });
    }

    const key = generatePartnerApiKey();
    const created = await prisma.partnerApiKey.create({
      data: {
        partnerId: session.partnerId,
        name,
        keyPrefix: partnerKeyPrefixFor(key),
        hashedKey: hashPartnerApiKey(key),
        createdByPartnerUserId: session.partnerUserId,
      },
      select: { id: true, name: true, keyPrefix: true, status: true, createdAt: true },
    });
    await createAuditLog({ action: "PARTNER_API_KEY_CREATED", actorEmail: session.email, metadata: { partnerId: session.partnerId, keyId: created.id } });

    // The only time the full key is ever returned.
    return NextResponse.json({ apiKey: created, key });
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
