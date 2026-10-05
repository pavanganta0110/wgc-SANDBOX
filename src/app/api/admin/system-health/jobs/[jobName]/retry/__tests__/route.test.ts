import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockGetAdminSession = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getAdminSession: () => mockGetAdminSession() }));

async function loadModule() {
  vi.resetModules();
  return import("../route");
}

function params(jobName: string) {
  return { params: Promise.resolve({ jobName }) };
}

const originalFetch = global.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "test_cron_secret";
  global.fetch = vi.fn().mockResolvedValue({ status: 200, json: async () => ({ ok: true }) }) as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("POST /api/admin/system-health/jobs/[jobName]/retry", () => {
  it("rejects an unauthenticated request", async () => {
    mockGetAdminSession.mockResolvedValue(null);
    const { POST } = await loadModule();
    const res = await POST(new Request("http://localhost", { method: "POST" }), params("aplos-sync"));
    expect(res.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("refuses to retry release-settlement-queue — it is never in the safe-retry allowlist", async () => {
    mockGetAdminSession.mockResolvedValue({ userId: "u1", role: "wgc_admin" });
    const { POST } = await loadModule();
    const res = await POST(new Request("http://localhost", { method: "POST" }), params("release-settlement-queue"));
    expect(res.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("refuses to retry a job name that doesn't exist at all", async () => {
    mockGetAdminSession.mockResolvedValue({ userId: "u1", role: "wgc_admin" });
    const { POST } = await loadModule();
    const res = await POST(new Request("http://localhost", { method: "POST" }), params("not-a-real-job"));
    expect(res.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("re-triggers a retry-safe job over HTTP against its own cron endpoint, with the CRON_SECRET bearer header", async () => {
    mockGetAdminSession.mockResolvedValue({ userId: "u1", role: "wgc_admin" });
    const { POST } = await loadModule();
    const res = await POST(new Request("http://localhost", { method: "POST" }), params("aplos-sync"));
    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/cron/aplos-sync");
    const headers = init.headers as Headers;
    expect(headers.get("authorization")).toBe("Bearer test_cron_secret");
  });

  it("surfaces a 500 rather than crashing when the underlying HTTP call itself throws", async () => {
    mockGetAdminSession.mockResolvedValue({ userId: "u1", role: "wgc_admin" });
    global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;
    const { POST } = await loadModule();
    const res = await POST(new Request("http://localhost", { method: "POST" }), params("aplos-sync"));
    expect(res.status).toBe(500);
  });
});
