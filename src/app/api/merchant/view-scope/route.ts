import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { setViewScope, clearViewScope, type ViewScope } from "@/lib/auth/viewScope";
import { hasPermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";

/**
 * Sets the reporting-scope cookie for "Viewing dashboard as X" — this is
 * reporting scope only, never a login/session swap. resolveViewScope()
 * re-validates every claim below on every subsequent read, so this route
 * only needs to reject obviously-invalid requests up front.
 */
export async function POST(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const body = await req.json().catch(() => ({}));
  const kind = body.kind;

  let scope: ViewScope;
  if (kind === "organization") {
    if (!hasPermission(auth, "canViewAllTransactions")) {
      return NextResponse.json({ error: "You don't have permission to view the full organization." }, { status: 403 });
    }
    scope = { kind: "organization" };
  } else if (kind === "currentUser") {
    scope = { kind: "currentUser" };
  } else if (kind === "user") {
    const userId = typeof body.userId === "string" ? body.userId : "";
    if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });
    if (!hasPermission(auth, "canViewAsUser")) {
      return NextResponse.json({ error: "You don't have permission to view another team member's scope." }, { status: 403 });
    }
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, churchId: true } });
    if (!target || target.churchId !== auth.churchId) {
      return NextResponse.json({ error: "Team member not found" }, { status: 404 });
    }
    scope = { kind: "user", userId };
  } else {
    return NextResponse.json({ error: "Invalid scope kind" }, { status: 400 });
  }

  await setViewScope(scope, auth.userId);
  return NextResponse.json({ success: true, scope });
}

export async function DELETE() {
  try {
    await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  await clearViewScope();
  return NextResponse.json({ success: true });
}
