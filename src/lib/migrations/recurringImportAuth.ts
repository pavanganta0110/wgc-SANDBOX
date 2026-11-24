import { NextResponse } from "next/server";
import { requireMfaVerifiedAdminSession } from "@/lib/auth/requireAdminSession";
import { isAuthError } from "@/lib/auth/errors";
import { prisma } from "@/lib/prisma";
import type { ImportActor } from "@/lib/migrations/recurringImportRun";

/**
 * Who may run a recurring import: a signed-in, MFA-verified WGC super admin only. The import creates recurring
 * charges on real donors, so it is not open to every support role, and never to a merchant.
 */
export async function requireRecurringImportAdmin(): Promise<{ actor: ImportActor } | { response: NextResponse }> {
  let session;
  try {
    session = await requireMfaVerifiedAdminSession();
  } catch (err) {
    if (isAuthError(err)) return { response: NextResponse.json({ error: err.message }, { status: err.status }) };
    throw err;
  }
  if (session.role !== "wgc_super_admin") return { response: NextResponse.json({ error: "Only a WGC super admin can run a recurring import." }, { status: 403 }) };
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { email: true } });
  return { actor: { userId: session.userId, email: user?.email ?? "", role: session.role } };
}

/** Funds of the organization, and a name -> id map: exact name match (case-insensitive) plus whatever staff chose. */
export async function buildFundMap(churchId: string, chosen: unknown): Promise<{ funds: { id: string; name: string }[]; fundMap: Record<string, string> }> {
  const funds = await prisma.fund.findMany({ where: { churchId }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const valid = new Set(funds.map((f) => f.id));
  const fundMap: Record<string, string> = {};
  for (const f of funds) fundMap[f.name.trim().toLowerCase()] = f.id;
  if (chosen && typeof chosen === "object") {
    for (const [name, id] of Object.entries(chosen as Record<string, unknown>)) {
      if (typeof id === "string" && valid.has(id)) fundMap[name.trim().toLowerCase()] = id; // never trust an id from the browser that is not this organization's
    }
  }
  return { funds, fundMap };
}
