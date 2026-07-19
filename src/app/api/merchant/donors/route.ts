import { NextResponse } from "next/server";
import { resolveDateRange } from "@/lib/dateRangePresets";
import { loadDonorsList, type DonorsListFilters, type DonorsListSort } from "@/lib/donors/donorsList";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import type { DonorDisplayStatus } from "@/lib/donors/donorStatus";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { resolveViewScope } from "@/lib/auth/viewScope";
import { resolveScopedDonorIds } from "@/lib/auth/scopes";
import { isAuthError } from "@/lib/auth/errors";

const SORT_KEYS = new Set(["createdAt", "name", "totalDonatedCents", "donationCount", "lastDonationAt", "firstDonationAt"]);
const STATUS_KEYS = new Set(["ARCHIVED", "AT_RISK", "RECURRING", "ACTIVE", "INACTIVE"]);

function parseDateFilter(range: string | null, from: string | null, to: string | null) {
  const { from: startDate, to: endDate } = resolveDateRange(range || undefined, from || undefined, to || undefined);
  return startDate ? { gte: startDate, ...(endDate ? { lte: endDate } : {}) } : undefined;
}

export async function GET(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const permissions = getDonorPermissions(auth.rawRole);
  if (!permissions.canView) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);

  const createdDateFilter = parseDateFilter(
    searchParams.get("range"),
    searchParams.get("from"),
    searchParams.get("to"),
  );

  const donorStatusParam = searchParams.get("status");
  const minTotal = searchParams.get("minTotal");
  const maxTotal = searchParams.get("maxTotal");
  const minCount = searchParams.get("minCount");
  const maxCount = searchParams.get("maxCount");
  const paymentMethodParam = searchParams.get("paymentMethod");
  const archivedParam = searchParams.get("archived");

  const filters: DonorsListFilters = {
    search: searchParams.get("q") || undefined,
    createdDateFilter,
    donorStatus: donorStatusParam && STATUS_KEYS.has(donorStatusParam) ? (donorStatusParam as DonorDisplayStatus) : undefined,
    recurringOnly: searchParams.get("recurring") === "1",
    paymentMethod: paymentMethodParam === "card" || paymentMethodParam === "bank" ? paymentMethodParam : undefined,
    minTotalDonatedCents: minTotal ? Math.round(parseFloat(minTotal) * 100) : undefined,
    maxTotalDonatedCents: maxTotal ? Math.round(parseFloat(maxTotal) * 100) : undefined,
    minDonationCount: minCount ? parseInt(minCount, 10) : undefined,
    maxDonationCount: maxCount ? parseInt(maxCount, 10) : undefined,
    fundId: searchParams.get("fundId") || undefined,
    givingLinkId: searchParams.get("givingLinkId") || undefined,
    hasFailedPayment: searchParams.get("hasFailedPayment") === "1",
    hasRefund: searchParams.get("hasRefund") === "1",
    hasBankReturn: searchParams.get("hasBankReturn") === "1",
    hasDispute: searchParams.get("hasDispute") === "1",
    hasActiveSubscription: searchParams.get("hasActiveSubscription") === "1",
    archivedStatus: archivedParam === "archived" || archivedParam === "all" ? archivedParam : "active",
  };

  const sortParam = searchParams.get("sort") || "createdAt:desc";
  const [sortKeyRaw, sortDirRaw] = sortParam.split(":");
  const sort: DonorsListSort = {
    key: (SORT_KEYS.has(sortKeyRaw) ? sortKeyRaw : "createdAt") as DonorsListSort["key"],
    dir: sortDirRaw === "asc" ? "asc" : "desc",
  };

  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "25", 10) || 25));

  // Team-access Checkpoint 4A: a donor is visible in a user-scoped view
  // only when they have a Payment or FinixSubscription attributed to that
  // user — Donor itself carries no ownerUserId/attributedUserId.
  const viewScope = await resolveViewScope(auth);
  filters.donorIdIn = await resolveScopedDonorIds(auth, viewScope);

  const result = await loadDonorsList(auth.churchId, filters, sort, page, pageSize);

  return NextResponse.json({
    rows: result.rows.map((r) => ({
      donor: {
        id: r.donor.id,
        name: r.donor.name,
        email: r.donor.email,
        phone: r.donor.phone,
        companyName: r.donor.companyName,
        anonymousPreference: r.donor.anonymousPreference,
        archivedAt: r.donor.archivedAt,
        createdAt: r.donor.createdAt,
        updatedAt: r.donor.updatedAt,
      },
      aggregates: r.aggregates,
      status: r.status,
      primaryInstrument: r.primaryInstrument
        ? {
            cardBrand: r.primaryInstrument.cardBrand,
            cardLast4: r.primaryInstrument.cardLast4,
            bankLast4: r.primaryInstrument.bankLast4,
            cardExpirationMonth: r.primaryInstrument.cardExpirationMonth,
            cardExpirationYear: r.primaryInstrument.cardExpirationYear,
          }
        : null,
      activeSubscriptionCount: r.activeSubscriptionCount,
    })),
    totalCount: result.totalCount,
    page: result.page,
    pageSize: result.pageSize,
  });
}
