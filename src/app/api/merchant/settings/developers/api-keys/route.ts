import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { API_SCOPES, isApiScope } from "@/lib/api/scopes";
import { generateApiKey, hashApiKey, keyPrefixFor } from "@/lib/api/keyHashing";

function toPublicApiKey(key: { hashedKey: string; [k: string]: unknown }) {
  const rest: Record<string, unknown> = { ...key };
  delete rest.hashedKey;
  return rest;
}

export async function GET() {
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canManageApiKeys");
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const keys = await prisma.apiKey.findMany({ where: { churchId: auth.churchId }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ keys: keys.map(toPublicApiKey), availableScopes: API_SCOPES });
}

export async function POST(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canManageApiKeys");
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const body = await req.json();
  const { name, scopes } = body;

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "A name is required" }, { status: 400 });
  }
  const validScopes = Array.isArray(scopes) ? scopes.filter(isApiScope) : [];
  if (validScopes.length === 0) {
    return NextResponse.json({ error: "Select at least one scope" }, { status: 400 });
  }

  const plaintextKey = generateApiKey();
  const apiKey = await prisma.apiKey.create({
    data: {
      churchId: auth.churchId,
      name: name.trim(),
      keyPrefix: keyPrefixFor(plaintextKey),
      hashedKey: hashApiKey(plaintextKey),
      scopesJson: validScopes,
      createdByUserId: auth.userId,
    },
  });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    action: "api_key.created",
    entityType: "ApiKey",
    entityId: apiKey.id,
    metadata: { name: apiKey.name, scopes: validScopes },
    req,
  });

  // The only moment the full key is ever returned.
  return NextResponse.json({ apiKey: toPublicApiKey(apiKey), key: plaintextKey });
}
