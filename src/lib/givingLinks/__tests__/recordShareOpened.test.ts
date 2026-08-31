import { describe, it, expect, vi, beforeEach } from "vitest";

const { updateMany } = vi.hoisted(() => ({ updateMany: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { givingLinkShare: { updateMany } },
}));

import { recordGivingLinkShareOpened } from "../recordShareOpened";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("recordGivingLinkShareOpened", () => {
  it("sets openedAt scoped to both the share id and its giving link id", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    await recordGivingLinkShareOpened("share-1", "link-1");
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "share-1", givingLinkId: "link-1", openedAt: null },
      data: { openedAt: expect.any(Date) },
    });
  });

  it("never throws — a tracking failure must not break the public giving page", async () => {
    updateMany.mockRejectedValue(new Error("db down"));
    await expect(recordGivingLinkShareOpened("share-1", "link-1")).resolves.toBeUndefined();
  });

  it("only ever matches an unopened row (openedAt: null in the where clause) — a revisit is a no-op, not a re-write", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    await recordGivingLinkShareOpened("share-1", "link-1");
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ openedAt: null }) }));
  });
});
