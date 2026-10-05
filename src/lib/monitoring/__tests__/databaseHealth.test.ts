import { describe, it, expect, vi, beforeEach } from "vitest";

const recordHealthEvent = vi.fn().mockResolvedValue({ eventId: "e1", wgcReference: "WGC-ABC123" });
vi.mock("../healthEvents", () => ({ recordHealthEvent: (...args: unknown[]) => recordHealthEvent(...args) }));

let registeredHandler: ((event: { message: string; target?: string }) => void) | undefined;
const mockPrisma = {
  $on: vi.fn((event: string, handler: (e: { message: string; target?: string }) => void) => {
    if (event === "error") registeredHandler = handler;
  }),
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

async function loadModule() {
  vi.resetModules();
  registeredHandler = undefined;
  return import("../databaseHealth");
}

beforeEach(() => vi.clearAllMocks());

describe("registerDatabaseHealthListener", () => {
  it("subscribes to Prisma's 'error' event exactly once, even if called twice", async () => {
    const { registerDatabaseHealthListener } = await loadModule();
    registerDatabaseHealthListener();
    registerDatabaseHealthListener();
    expect(mockPrisma.$on).toHaveBeenCalledTimes(1);
  });

  it("records a Supabase health event when Prisma emits a real error", async () => {
    const { registerDatabaseHealthListener } = await loadModule();
    registerDatabaseHealthListener();
    registeredHandler?.({ message: "Connection pool timeout", target: "findMany" });

    expect(recordHealthEvent).toHaveBeenCalledWith(
      expect.objectContaining({ service: "Supabase", status: "FAILED", severity: "ERROR", message: "Connection pool timeout" })
    );
  });

  it("never throws even if recordHealthEvent itself rejects — a monitoring failure must not crash the app", async () => {
    recordHealthEvent.mockRejectedValueOnce(new Error("write failed"));
    const { registerDatabaseHealthListener } = await loadModule();
    registerDatabaseHealthListener();
    expect(() => registeredHandler?.({ message: "some db error" })).not.toThrow();
  });
});
