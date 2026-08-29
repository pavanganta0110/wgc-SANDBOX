import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { toSafeErrorResponse } from "@/lib/utils/errorNormalizer";
import { loadEmailLogsList } from "@/lib/emailLogs/loadEmailLogsList";

export async function GET(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return toSafeErrorResponse(err.message, err.status);
    throw err;
  }
  try {
    requirePermission(auth, "canViewEmailLogs");
  } catch (err) {
    if (err instanceof ForbiddenError) return toSafeErrorResponse(err.message, 403);
    throw err;
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);

  const result = await loadEmailLogsList(
    auth.churchId,
    {
      category: searchParams.get("category") || undefined,
      status: searchParams.get("status") || undefined,
      search: searchParams.get("search")?.trim() || undefined,
      from: searchParams.get("from") || undefined,
      to: searchParams.get("to") || undefined,
    },
    page
  );

  return NextResponse.json(result);
}
