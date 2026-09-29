import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetAdminSession = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getAdminSession: () => mockGetAdminSession() }));

// Every cron route this retry endpoint can trigger is mocked so the test
// exercises only the retry endpoint's own gating/dispatch logic, never a
// real job's business logic.
const mockAplosSyncGet = vi.fn();
const mockWebhookRetryGet = vi.fn();
const mockReconcileGet = vi.fn();
vi.mock("@/app/api/cron/aplos-sync/route", () => ({ GET: (...a: unknown[]) => mockAplosSyncGet(...a) }));
vi.mock("@/app/api/cron/webhook-retry/route", () => ({ GET: (...a: unknown[]) => mockWebhookRetryGet(...a) }));
vi.mock("@/app/api/cron/reconcile/route", () => ({ GET: (...a: unknown[]) => mockReconcileGet(...a) }));
vi.mock("@/app/api/cron/reconcile-subscriptions/route", () => ({ GET: vi.fn() }));
vi.mock("@/app/api/cron/invoice-reminders/route", () => ({ GET: vi.fn() }));
vi.mock("@/app/api/cron/promo-shortfall-check/route", () => ({ GET: vi.fn() }));
vi.mock("@/app/api/cron/sms-addon-overage-check/route", () => ({ GET: vi.fn() }));
vi.mock("@/app/api/cron/resync-transfer-fees/route", () => ({ GET: vi.fn() }));
vi.mock("@/app/api/cron/resync-monthly-transfer-fees/route", () => ({ GET: vi.fn() }));
vi.mock("@/app/api/cron/system-health-sweep/route", () => ({ GET: vi.fn() }));

async function loadModule() {
  vi.resetModules();
  return import("../route");
}

function params(jobName: string) {
  return { params: Promise.resolve({ jobName }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAplosSyncGet.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
});

describe("POST /api/admin/system-health/jobs/[jobName]/retry", () => {
  it("rejects an unauthenticated request", async () => {
    mockGetAdminSession.mockResolvedValue(null);
    const { POST } = await loadModule();
    const res = await POST(new Request("http://localhost", { method: "POST" }), params("aplos-sync"));
    expect(res.status).toBe(401);
  });

  it("refuses to retry release-settlement-queue — it is never in the safe-retry allowlist", async () => {
    mockGetAdminSession.mockResolvedValue({ userId: "u1", role: "wgc_admin" });
    const { POST } = await loadModule();
    const res = await POST(new Request("http://localhost", { method: "POST" }), params("release-settlement-queue"));
    expect(res.status).toBe(400);
    expect(mockReconcileGet).not.toHaveBeenCalled();
  });

  it("refuses to retry a job name that doesn't exist at all", async () => {
    mockGetAdminSession.mockResolvedValue({ userId: "u1", role: "wgc_admin" });
    const { POST } = await loadModule();
    const res = await POST(new Request("http://localhost", { method: "POST" }), params("not-a-real-job"));
    expect(res.status).toBe(400);
  });

  it("re-triggers a retry-safe job by invoking its own cron route handler in-process", async () => {
    mockGetAdminSession.mockResolvedValue({ userId: "u1", role: "wgc_admin" });
    const { POST } = await loadModule();
    const res = await POST(new Request("http://localhost", { method: "POST" }), params("aplos-sync"));
    expect(res.status).toBe(200);
    expect(mockAplosSyncGet).toHaveBeenCalledTimes(1);
    const forwardedRequest = mockAplosSyncGet.mock.calls[0][0] as Request;
    expect(forwardedRequest.url).toContain("aplos-sync");
  });

  it("surfaces a 500 rather than crashing when the underlying job handler itself throws", async () => {
    mockGetAdminSession.mockResolvedValue({ userId: "u1", role: "wgc_admin" });
    mockAplosSyncGet.mockRejectedValue(new Error("boom"));
    const { POST } = await loadModule();
    const res = await POST(new Request("http://localhost", { method: "POST" }), params("aplos-sync"));
    expect(res.status).toBe(500);
  });
});
