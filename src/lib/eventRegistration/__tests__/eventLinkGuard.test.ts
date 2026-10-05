import { describe, it, expect, vi, beforeEach } from "vitest";

const eventFindFirst = vi.fn();
const linkFindUnique = vi.fn();
const churchFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: { findFirst: (...a: unknown[]) => eventFindFirst(...a) },
    givingLink: { findUnique: (...a: unknown[]) => linkFindUnique(...a) },
    church: { findUnique: (...a: unknown[]) => churchFindUnique(...a) },
  },
}));

import { isEventGivingLink } from "@/lib/eventRegistration/eventGivingLink";
import { loadPublicGivingPageData } from "@/lib/givingLinks/loadPublicGivingPageData";

beforeEach(() => vi.clearAllMocks());

describe("an event's dedicated checkout link", () => {
  it("is recognised by the event that owns it, within the church", async () => {
    eventFindFirst.mockResolvedValue({ id: "e1" });
    expect(await isEventGivingLink("churchA", "L1")).toBe(true);
    expect(eventFindFirst).toHaveBeenCalledWith({ where: { churchId: "churchA", givingLinkId: "L1" }, select: { id: true } });
    eventFindFirst.mockResolvedValue(null);
    expect(await isEventGivingLink("churchA", "L2")).toBe(false);
  });

  it("is not served as a public Giving Page", async () => {
    linkFindUnique.mockResolvedValue({ id: "L1", churchId: "churchA" });
    churchFindUnique.mockResolvedValue({ id: "churchA", finixMerchantId: "MU1" });
    eventFindFirst.mockResolvedValue({ id: "e1" });
    expect(await loadPublicGivingPageData("slug")).toEqual({ ok: false, notFound: true });
  });
});
