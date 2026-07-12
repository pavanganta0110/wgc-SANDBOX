import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getSubscriptionPermissions } from "@/lib/subscriptions/subscriptionPermissions";
import { loadSubscriptionsList, type SubscriptionsSortKey } from "@/lib/subscriptions/subscriptionsList";
import type { SubscriptionDisplayStatus } from "@/lib/subscriptions/subscriptionStatus";

function parseDateFilter(fromStr: string | null, toStr: string | null): { gte: Date; lte?: Date } | undefined {
  if (!fromStr) return undefined;
  const gte = new Date(fromStr);
  if (Number.isNaN(gte.getTime())) return undefined;
  const lte = toStr ? new Date(toStr) : undefined;
  return { gte, ...(lte && !Number.isNaN(lte.getTime()) ? { lte } : {}) };
}

export async function GET(req: Request) {
  const session = await getSession();
  const permissions = getSubscriptionPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canView) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "25", 10) || 25));
  const sortKey = (searchParams.get("sort") || "createdAt") as SubscriptionsSortKey;
  const sortDir = (searchParams.get("dir") || "desc") as "asc" | "desc";

  const result = await loadSubscriptionsList(
    session.churchId,
    {
      search: searchParams.get("search")?.trim() || undefined,
      status: (searchParams.get("status") as SubscriptionDisplayStatus) || undefined,
      frequency: searchParams.get("frequency") || undefined,
      givingLinkId: searchParams.get("givingLinkId") || undefined,
      fundId: searchParams.get("fundId") || undefined,
      minAmountCents: searchParams.get("minAmount") ? Math.round(parseFloat(searchParams.get("minAmount")!) * 100) : undefined,
      maxAmountCents: searchParams.get("maxAmount") ? Math.round(parseFloat(searchParams.get("maxAmount")!) * 100) : undefined,
      minMonthlyValueCents: searchParams.get("minMonthly") ? Math.round(parseFloat(searchParams.get("minMonthly")!) * 100) : undefined,
      maxMonthlyValueCents: searchParams.get("maxMonthly") ? Math.round(parseFloat(searchParams.get("maxMonthly")!) * 100) : undefined,
      hasFailedPayment: searchParams.get("hasFailedPayment") === "1",
      hasPastDue: searchParams.get("hasPastDue") === "1",
      requiresAttention: searchParams.get("requiresAttention") === "1",
      createdDateFilter: parseDateFilter(searchParams.get("createdFrom"), searchParams.get("createdTo")),
      startDateFilter: parseDateFilter(searchParams.get("startFrom"), searchParams.get("startTo")),
      nextBillingDateFilter: parseDateFilter(searchParams.get("nextBillingFrom"), searchParams.get("nextBillingTo")),
    },
    { key: sortKey, dir: sortDir },
    page,
    pageSize,
  );

  return NextResponse.json({ ...result, page, pageSize });
}
