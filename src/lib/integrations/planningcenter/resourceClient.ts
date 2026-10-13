import { PLANNING_CENTER_API_BASE_URL, getPlanningCenterUserAgent } from "./config";
import {
  classifyHttpStatus,
  classifyNetworkOrTimeoutError,
  PlanningCenterApiError,
  type NormalizedPlanningCenterError,
} from "./errors";

/**
 * Thin wrapper over the Planning Center JSON:API REST API. Every later
 * phase goes through this, so the rules below are enforced here once:
 *
 * - Every request carries an identifying User-Agent (PCO may 403 without).
 * - Hard timeout via AbortController.
 * - Rate limits (default 100 req / 20s per user) are read from the
 *   X-PCO-API-Request-Rate-* headers; we slow down near the limit and honor
 *   Retry-After on 429.
 * - ONLY idempotent requests (GET) are ever retried. Planning Center has no
 *   idempotency key, so blindly retrying a POST/PATCH could create a
 *   duplicate record (later phases: duplicate donations).
 */

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_GET_RETRIES = 3;
const MAX_RETRY_WAIT_MS = 20_000;
const SLOWDOWN_THRESHOLD = 0.8;
const SLOWDOWN_MS = 1_000;

export interface PlanningCenterClientOptions {
  accessToken: string;
  /** Test seam — defaults to real timers. */
  sleep?: (ms: number) => Promise<void>;
}

export interface PlanningCenterRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function readRetryAfterSeconds(response: Response): number | undefined {
  const raw = response.headers.get("Retry-After");
  if (!raw) return undefined;
  const seconds = parseInt(raw, 10);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

export class PlanningCenterClient {
  private readonly accessToken: string;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: PlanningCenterClientOptions) {
    this.accessToken = options.accessToken;
    this.sleep = options.sleep ?? defaultSleep;
  }

  async request<T>(path: string, options: PlanningCenterRequestOptions = {}): Promise<T> {
    const method = options.method ?? "GET";
    const maxAttempts = method === "GET" ? MAX_GET_RETRIES + 1 : 1;

    for (let attempt = 1; ; attempt++) {
      let response: Response;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        response = await fetch(`${PLANNING_CENTER_API_BASE_URL}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            Accept: "application/json",
            "Content-Type": "application/json",
            "User-Agent": getPlanningCenterUserAgent(),
          },
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          signal: controller.signal,
        });
      } catch {
        if (attempt < maxAttempts) {
          await this.sleep(Math.min(1_000 * attempt, MAX_RETRY_WAIT_MS));
          continue;
        }
        throw new PlanningCenterApiError(classifyNetworkOrTimeoutError(), 0);
      } finally {
        clearTimeout(timeout);
      }

      if (response.ok) {
        // Be polite near the limit so a burst of calls doesn't trip a 429.
        const limit = parseInt(response.headers.get("X-PCO-API-Request-Rate-Limit") ?? "", 10);
        const count = parseInt(response.headers.get("X-PCO-API-Request-Rate-Count") ?? "", 10);
        if (Number.isFinite(limit) && Number.isFinite(count) && limit > 0 && count >= limit * SLOWDOWN_THRESHOLD) {
          await this.sleep(SLOWDOWN_MS);
        }
        if (response.status === 204) return undefined as T;
        return (await response.json()) as T;
      }

      const retryAfterSeconds = readRetryAfterSeconds(response);
      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt < maxAttempts) {
        const waitMs = Math.min((retryAfterSeconds ?? attempt) * 1_000, MAX_RETRY_WAIT_MS);
        await this.sleep(waitMs);
        continue;
      }

      const normalized: NormalizedPlanningCenterError = { ...classifyHttpStatus(response.status), retryAfterSeconds };
      throw new PlanningCenterApiError(normalized, response.status);
    }
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: "GET" });
  }
}

interface JsonApiResource {
  data?: { id?: string; attributes?: Record<string, unknown>; };
  meta?: { parent?: { id?: string } };
}

export interface PlanningCenterIdentity {
  organizationId: string;
  organizationName: string | null;
  userId: string | null;
  userName: string | null;
}

/**
 * Who authorized, and which Planning Center organization they belong to.
 * `/people/v2` is the Organization resource; `/people/v2/me` is the
 * authorizing user. Requires the `people` scope.
 */
export async function fetchPlanningCenterIdentity(client: PlanningCenterClient): Promise<PlanningCenterIdentity> {
  const me = await client.get<JsonApiResource>("/people/v2/me");
  let organizationId = me.meta?.parent?.id ?? null;
  let organizationName: string | null = null;

  try {
    const org = await client.get<JsonApiResource>("/people/v2");
    organizationId = org.data?.id ?? organizationId;
    const name = org.data?.attributes?.name;
    organizationName = typeof name === "string" ? name : null;
  } catch (err) {
    // The org name is cosmetic; the id (from /me's parent) is what matters.
    if (!(err instanceof PlanningCenterApiError)) throw err;
  }

  if (!organizationId) {
    throw new PlanningCenterApiError(
      { category: "UNKNOWN_ERROR", retryable: false, safeMessage: "Planning Center did not say which organization this account belongs to." },
      200
    );
  }

  const userName = me.data?.attributes?.name;
  return {
    organizationId,
    organizationName,
    userId: me.data?.id ?? null,
    userName: typeof userName === "string" ? userName : null,
  };
}

/** Giving read access: a cheap list call. 403 means the authorizing user
 * has no Giving permission. Any other failure is surfaced to the caller. */
export async function probeGivingAccess(client: PlanningCenterClient): Promise<boolean> {
  try {
    await client.get("/giving/v2/payment_sources?per_page=1");
    return true;
  } catch (err) {
    if (err instanceof PlanningCenterApiError && err.status === 403) return false;
    throw err;
  }
}
