import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  systemErrorGroup: { upsert: vi.fn() },
  systemHealthEvent: { create: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

async function loadModule() {
  vi.resetModules();
  return import("../healthEvents");
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.systemErrorGroup.upsert.mockResolvedValue({ id: "group_1" });
  mockPrisma.systemHealthEvent.create.mockResolvedValue({ id: "event_1" });
});

describe("recordHealthEvent", () => {
  it("returns an eventId and a WGC-XXXXXX reference on success", async () => {
    const { recordHealthEvent } = await loadModule();
    const result = await recordHealthEvent({ service: "Resend", status: "FAILED", severity: "ERROR", message: "Send failed" });
    expect(result?.eventId).toBe("event_1");
    expect(result?.wgcReference).toMatch(/^WGC-[0-9A-Z]{6}$/);
  });

  it("redacts sensitive-looking content out of the message before writing it", async () => {
    const { recordHealthEvent } = await loadModule();
    await recordHealthEvent({ service: "Finix", status: "FAILED", severity: "ERROR", message: "Card 4111111111111111 failed to process" });
    const createArgs = mockPrisma.systemHealthEvent.create.mock.calls[0][0];
    expect(createArgs.data.message).not.toContain("4111111111111111");
    expect(createArgs.data.message).toContain("[REDACTED_CARD]");
  });

  it("redacts sensitive-looking content out of metadata before writing it", async () => {
    const { recordHealthEvent } = await loadModule();
    await recordHealthEvent({
      service: "Finix",
      status: "FAILED",
      severity: "ERROR",
      message: "failure",
      metadata: { note: "account 12345678901234 flagged" },
    });
    const createArgs = mockPrisma.systemHealthEvent.create.mock.calls[0][0];
    expect(JSON.stringify(createArgs.data.metadata)).not.toContain("12345678901234");
  });

  it("upserts a SystemErrorGroup for ERROR severity and links the event to it", async () => {
    const { recordHealthEvent } = await loadModule();
    await recordHealthEvent({ service: "Aplos", status: "FAILED", severity: "ERROR", message: "sync failed" });
    expect(mockPrisma.systemErrorGroup.upsert).toHaveBeenCalledOnce();
    const createArgs = mockPrisma.systemHealthEvent.create.mock.calls[0][0];
    expect(createArgs.data.errorGroupId).toBe("group_1");
  });

  it("upserts a SystemErrorGroup for CRITICAL severity too", async () => {
    const { recordHealthEvent } = await loadModule();
    await recordHealthEvent({ service: "Finix", status: "FAILED", severity: "CRITICAL", message: "everything is down" });
    expect(mockPrisma.systemErrorGroup.upsert).toHaveBeenCalledOnce();
  });

  it("does NOT create a SystemErrorGroup for INFO or WARNING severity", async () => {
    const { recordHealthEvent } = await loadModule();
    await recordHealthEvent({ service: "Twilio", status: "SUCCESS", severity: "INFO", message: "heartbeat ok" });
    await recordHealthEvent({ service: "Twilio", status: "WARNING", severity: "WARNING", message: "slow response" });
    expect(mockPrisma.systemErrorGroup.upsert).not.toHaveBeenCalled();
  });

  it("groups the same service+route+normalized message under the same fingerprint", async () => {
    const { recordHealthEvent } = await loadModule();
    await recordHealthEvent({ service: "Finix", route: "/api/refund", status: "FAILED", severity: "ERROR", message: "timeout after 8000ms" });
    await recordHealthEvent({ service: "Finix", route: "/api/refund", status: "FAILED", severity: "ERROR", message: "timeout after 12000ms" });
    const firstFingerprint = mockPrisma.systemErrorGroup.upsert.mock.calls[0][0].where.fingerprint;
    const secondFingerprint = mockPrisma.systemErrorGroup.upsert.mock.calls[1][0].where.fingerprint;
    expect(firstFingerprint).toBe(secondFingerprint);
  });

  it("never throws even when the database write fails", async () => {
    mockPrisma.systemHealthEvent.create.mockRejectedValueOnce(new Error("db down"));
    const { recordHealthEvent } = await loadModule();
    await expect(recordHealthEvent({ service: "Finix", status: "FAILED", severity: "ERROR", message: "boom" })).resolves.toBeNull();
  });

  it("stamps the release from VERCEL_GIT_COMMIT_SHA when present", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "abc123");
    const { recordHealthEvent } = await loadModule();
    await recordHealthEvent({ service: "Finix", status: "FAILED", severity: "ERROR", message: "boom" });
    const createArgs = mockPrisma.systemHealthEvent.create.mock.calls[0][0];
    expect(createArgs.data.release).toBe("abc123");
    vi.unstubAllEnvs();
  });
});
