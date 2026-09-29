import { NextResponse } from "next/server";

// Moved to src/lib/monitoring/requestId.ts so it's available app-wide (admin,
// merchant, webhooks, cron), not just this partner-API module — re-exported
// here so every existing /api/v1 caller keeps working unchanged.
export { generateRequestId } from "@/lib/monitoring/requestId";

export type ApiErrorType =
  | "authentication_error"
  | "authorization_error"
  | "not_found_error"
  | "validation_error"
  | "rate_limit_error"
  | "internal_error";

const STATUS_BY_TYPE: Record<ApiErrorType, number> = {
  authentication_error: 401,
  authorization_error: 403,
  not_found_error: 404,
  validation_error: 400,
  rate_limit_error: 429,
  internal_error: 500,
};

/** Structured, versioned error response — every /api/v1 route returns
 * errors in this exact shape, never a bare string or an ad-hoc object. */
export function apiError(type: ApiErrorType, message: string, requestId: string, extra?: Record<string, unknown>) {
  return NextResponse.json(
    { error: { type, message, requestId, ...extra } },
    { status: STATUS_BY_TYPE[type], headers: { "X-Request-Id": requestId } }
  );
}

export function apiSuccess<T>(data: T, requestId: string, meta?: Record<string, unknown>) {
  return NextResponse.json({ data, requestId, ...meta }, { headers: { "X-Request-Id": requestId } });
}

export interface PaginationParams {
  limit: number;
  cursor: string | null;
}

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export function parsePagination(searchParams: URLSearchParams): PaginationParams {
  const rawLimit = Number(searchParams.get("limit"));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(MAX_LIMIT, Math.floor(rawLimit)) : DEFAULT_LIMIT;
  const cursor = searchParams.get("cursor");
  return { limit, cursor };
}

/** Cursor-paginated list response — cursor is the last row's id, matching
 * Prisma's own `cursor`/`skip: 1` pagination convention directly. */
export function paginationMeta<T extends { id: string }>(items: T[], limit: number) {
  const hasMore = items.length > limit;
  const page = hasMore ? items.slice(0, limit) : items;
  return { page, hasMore, nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null };
}
