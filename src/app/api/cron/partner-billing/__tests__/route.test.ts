import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const runPartnerBilling = vi.hoisted(() => vi.fn());
vi.mock("@/lib/partners/partnerInvoicing", () => ({ runPartnerBilling }));
vi.mock("@/lib/monitoring/jobRunTracking", () => ({ withJobRunTracking: async (_p: unknown, fn: () => Promise<unknown>) => fn() }));
vi.mock("@/lib/cron/alertCronMisconfiguration", () => ({ alertCronMisconfiguration: vi.fn() }));

import { GET } from "../route";

const call = (authorization?: string) => GET(new Request("https://wgc.test/api/cron/partner-billing", { headers: authorization ? { authorization } : {} }));

beforeEach(() => {
  vi.clearAllMocks();
  runPartnerBilling.mockResolvedValue({ period: "2026-11", invoicesMade: 1, charged: 1, failed: 0, awaitingCard: 0, pending: 0, chargingEnabled: true });
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/cron/partner-billing", () => {
  it("refuses a wrong secret", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect((await call("Bearer nope")).status).toBe(401);
    expect(runPartnerBilling).not.toHaveBeenCalled();
  });

  it("in production it needs the secret to be configured, and to match", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect((await call()).status).toBe(500);
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect((await call()).status).toBe(401);
    expect((await call("Bearer s3cret")).status).toBe(200);
  });

  it("runs the billing job and reports its counts", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const res = await call("Bearer s3cret");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(runPartnerBilling).toHaveBeenCalledTimes(1);
    expect(body).toMatchObject({ success: true, processedCount: 2, successCount: 2, failedCount: 0 });
  });
});
