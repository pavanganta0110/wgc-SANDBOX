import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PlanningCenterApiError } from "../errors";
import { PlanningCenterClient, fetchPlanningCenterIdentity, probeGivingAccess } from "../resourceClient";

function res(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, headers: new Headers(headers) } as Response;
}

describe("PlanningCenterClient", () => {
  const originalFetch = global.fetch;
  const sleep = vi.fn(async () => {});
  const fetchMock = vi.fn();

  beforeEach(() => {
    sleep.mockClear();
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  const client = () => new PlanningCenterClient({ accessToken: "tok", sleep });

  it("sends the bearer token and a User-Agent", async () => {
    fetchMock.mockResolvedValue(res({ ok: true }));
    await client().get("/people/v2/me");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.planningcenteronline.com/people/v2/me");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(init.headers["User-Agent"]).toBeTruthy();
  });

  it("retries a GET on 429 honoring Retry-After", async () => {
    fetchMock.mockResolvedValueOnce(res({}, 429, { "Retry-After": "3" })).mockResolvedValueOnce(res({ ok: 1 }));
    await expect(client().get("/x")).resolves.toEqual({ ok: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(3000);
  });

  it("gives up on a GET after repeated 429s", async () => {
    fetchMock.mockResolvedValue(res({}, 429, { "Retry-After": "1" }));
    await expect(client().get("/x")).rejects.toMatchObject({ status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("NEVER retries a POST, even on 429 or 5xx (no idempotency key)", async () => {
    fetchMock.mockResolvedValue(res({}, 429, { "Retry-After": "1" }));
    await expect(client().request("/giving/v2/donations", { method: "POST", body: {} })).rejects.toBeInstanceOf(PlanningCenterApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockReset();
    fetchMock.mockResolvedValue(res({}, 503));
    await expect(client().request("/x", { method: "POST", body: {} })).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry a POST that failed on the network either", async () => {
    fetchMock.mockRejectedValue(new Error("reset"));
    await expect(client().request("/x", { method: "POST", body: {} })).rejects.toMatchObject({ status: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("slows down near the rate limit", async () => {
    fetchMock.mockResolvedValue(res({}, 200, { "X-PCO-API-Request-Rate-Limit": "100", "X-PCO-API-Request-Rate-Count": "85" }));
    await client().get("/x");
    expect(sleep).toHaveBeenCalledWith(1000);
  });

  it("classifies 401 and 403 without retrying", async () => {
    fetchMock.mockResolvedValue(res({}, 403));
    await expect(client().get("/x")).rejects.toMatchObject({ normalized: { category: "ACCESS_DENIED" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("identity and Giving probe", () => {
  const stub = (responses: Record<string, unknown | Error>) =>
    ({
      get: vi.fn(async (path: string) => {
        const r = responses[path];
        if (r instanceof Error) throw r;
        return r;
      }),
    }) as unknown as PlanningCenterClient;

  it("reads org id/name and the authorizing user", async () => {
    const identity = await fetchPlanningCenterIdentity(
      stub({
        "/people/v2/me": { data: { id: "9", attributes: { name: "Pat Admin" } }, meta: { parent: { id: "127" } } },
        "/people/v2": { data: { id: "127", attributes: { name: "Test Church" } } },
      })
    );
    expect(identity).toEqual({ organizationId: "127", organizationName: "Test Church", userId: "9", userName: "Pat Admin" });
  });

  it("falls back to the parent org id if the org name call fails", async () => {
    const identity = await fetchPlanningCenterIdentity(
      stub({
        "/people/v2/me": { data: { id: "9", attributes: { name: "Pat" } }, meta: { parent: { id: "127" } } },
        "/people/v2": new PlanningCenterApiError({ category: "ACCESS_DENIED", retryable: false, safeMessage: "x" }, 403),
      })
    );
    expect(identity.organizationId).toBe("127");
    expect(identity.organizationName).toBeNull();
  });

  it("fails if no organization id can be determined", async () => {
    await expect(
      fetchPlanningCenterIdentity(stub({ "/people/v2/me": { data: { id: "9" } }, "/people/v2": { data: {} } }))
    ).rejects.toBeInstanceOf(PlanningCenterApiError);
  });

  it("probeGivingAccess is false on 403 and rethrows other errors", async () => {
    const forbidden = new PlanningCenterApiError({ category: "ACCESS_DENIED", retryable: false, safeMessage: "x" }, 403);
    await expect(probeGivingAccess(stub({ "/giving/v2/payment_sources?per_page=1": forbidden }))).resolves.toBe(false);
    await expect(probeGivingAccess(stub({ "/giving/v2/payment_sources?per_page=1": { data: [] } }))).resolves.toBe(true);
    const boom = new PlanningCenterApiError({ category: "TEMPORARY_PLANNING_CENTER_ERROR", retryable: true, safeMessage: "x" }, 500);
    await expect(probeGivingAccess(stub({ "/giving/v2/payment_sources?per_page=1": boom }))).rejects.toBe(boom);
  });
});
