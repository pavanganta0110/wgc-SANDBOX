import { NextResponse } from "next/server";
import { getSubscriptionPermissions } from "@/lib/subscriptions/subscriptionPermissions";
import { loadRecurringDonorsList, type RecurringDonorsSortKey } from "@/lib/subscriptions/recurringDonorsList";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { resolveViewScope } from "@/lib/auth/viewScope";
import { resolveScopedUserId } from "@/lib/auth/scopes";
import { isAuthError } from "@/lib/auth/errors";

function parseDateFilter(fromStr: string | null, toStr: string | null): { gte: Date; lte?: Date } | undefined {
  if (!fromStr) return undefined;
  const gte = new Date(fromStr);
  if (Number.isNaN(gte.getTime())) return undefined;
  const lte = toStr ? new Date(toStr) : undefined;
  return { gte, ...(lte && !Number.isNaN(lte.getTime()) ? { lte } : {}) };
}

export async function GET(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const permissions = getSubscriptionPermissions(auth.rawRole);
  if (!permissions.canView) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "25", 10) || 25));
  const sortKey = (searchParams.get("sort") || "monthlyValue") as RecurringDonorsSortKey;
  const sortDir = (searchParams.get("dir") || "desc") as "asc" | "desc";

  const viewScope = await resolveViewScope(auth);
  const scopedUserId = resolveScopedUserId(auth, viewScope) ?? undefined;

  const result = await loadRecurringDonorsList(
    auth.churchId,
    {
      attributedUserId: scopedUserId,
      search: searchParams.get("search")?.trim() || undefined,
      status: searchParams.get("status") || undefined,
      frequency: searchParams.get("frequency") || undefined,
      givingLinkId: searchParams.get("givingLinkId") || undefined,
      fundId: searchParams.get("fundId") || undefined,
      minMonthlyValueCents: searchParams.get("minMonthly") ? Math.round(parseFloat(searchParams.get("minMonthly")!) * 100) : undefined,
      maxMonthlyValueCents: searchParams.get("maxMonthly") ? Math.round(parseFloat(searchParams.get("maxMonthly")!) * 100) : undefined,
      hasFailedPayment: searchParams.get("hasFailedPayment") === "1",
      hasPastDue: searchParams.get("hasPastDue") === "1",
      requiresAttention: searchParams.get("requiresAttention") === "1",
      createdDateFilter: parseDateFilter(searchParams.get("createdFrom"), searchParams.get("createdTo")),
      nextBillingDateFilter: parseDateFilter(searchParams.get("nextBillingFrom"), searchParams.get("nextBillingTo")),
    },
    { key: sortKey, dir: sortDir },
    page,
    pageSize,
  );

  return NextResponse.json({ ...result, page, pageSize });
}
