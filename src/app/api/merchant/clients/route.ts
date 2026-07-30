import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { normalizeEmail, normalizePhone } from "@/lib/donors/donorContact";

/** Lightweight client search — used by the invoice builder's client picker
 * (type-ahead) as well as any other future consumer that just needs a
 * short list of matching clients, not the full paginated/aggregated list
 * page (see clientsList.ts for that). */
export async function GET(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  try {
    requirePermission(auth, "canViewInvoices");
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const { searchParams } = new URL(req.url);
  const search = (searchParams.get("q") || "").trim();

  const clients = await prisma.client.findMany({
    where: {
      churchId: auth.churchId,
      archivedAt: null,
      ...(search
        ? {
            OR: [
              { displayName: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { organizationName: { contains: search, mode: "insensitive" } },
              ...(normalizeEmail(search) ? [{ normalizedEmail: normalizeEmail(search) }] : []),
              ...(normalizePhone(search) ? [{ normalizedPhone: normalizePhone(search) }] : []),
            ],
          }
        : {}),
    },
    orderBy: { displayName: "asc" },
    take: 25,
    select: { id: true, displayName: true, email: true, phone: true, organizationName: true, clientType: true },
  });

  return NextResponse.json({ clients });
}
