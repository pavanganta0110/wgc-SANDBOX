import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = { user: { updateMany: vi.fn() } };
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

async function loadModule() {
  vi.resetModules();
  return import("../activity");
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });
});

describe("touchUserActivity", () => {
  it("updates lastActiveAt for the given user, guarded to only touch a null-or-stale row", async () => {
    const { touchUserActivity } = await loadModule();
    await touchUserActivity("user_1");
    const call = mockPrisma.user.updateMany.mock.calls[0][0];
    expect(call.where.id).toBe("user_1");
    expect(call.where.OR).toEqual(expect.arrayContaining([{ lastActiveAt: null }, expect.objectContaining({ lastActiveAt: expect.objectContaining({ lt: expect.any(Date) }) })]));
    expect(call.data.lastActiveAt).toBeInstanceOf(Date);
  });

  it("never throws even when the write itself fails — activity tracking must never break an auth check", async () => {
    mockPrisma.user.updateMany.mockRejectedValue(new Error("db blip"));
    const { touchUserActivity } = await loadModule();
    await expect(touchUserActivity("user_1")).resolves.toBeUndefined();
  });
});
