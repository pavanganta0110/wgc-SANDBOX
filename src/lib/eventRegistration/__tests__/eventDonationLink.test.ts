import { describe, it, expect, vi, beforeEach } from "vitest";

const linkFindMany = vi.fn();
const linkFindFirst = vi.fn();
const linkFindUnique = vi.fn();
const linkCreate = vi.fn();
const eventFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    givingLink: {
      findMany: (...a: unknown[]) => linkFindMany(...a),
      findFirst: (...a: unknown[]) => linkFindFirst(...a),
      findUnique: (...a: unknown[]) => linkFindUnique(...a),
      create: (...a: unknown[]) => linkCreate(...a),
    },
    event: { findMany: (...a: unknown[]) => eventFindMany(...a) },
  },
}));

import { listMonthlyGiftLinkOptions, resolveEventDonationLink } from "@/lib/eventRegistration/eventGivingLink";

const link = (id: string, extra: Record<string, unknown> = {}) => ({ id, publicSlug: `slug-${id}`, publicTitle: `Title ${id}`, internalName: `Name ${id}`, allowedFrequenciesJson: ["MONTHLY"], ...extra });
const event = { name: "Gala", status: "ACTIVE", hostName: null, enabled: true };

beforeEach(() => {
  [linkFindMany, linkFindFirst, linkFindUnique, linkCreate, eventFindMany].forEach((m) => m.mockReset());
  eventFindMany.mockResolvedValue([]);
  linkFindUnique.mockResolvedValue(null);
  linkCreate.mockResolvedValue({ id: "auto1" });
});

describe("listMonthlyGiftLinkOptions", () => {
  it("lists only this church's active, recurring, monthly-capable pages", async () => {
    linkFindMany.mockResolvedValue([link("a"), link("b", { allowedFrequenciesJson: ["YEARLY"] }), link("c")]);
    const out = await listMonthlyGiftLinkOptions("churchA");
    expect(linkFindMany.mock.calls[0][0].where).toEqual({ churchId: "churchA", status: "ACTIVE", recurringEnabled: true });
    expect(out.map((o) => o.id)).toEqual(["a", "c"]);
  });

  it("leaves out pages that events own (their checkout page, or their own monthly page) but keeps pages an event merely points at", async () => {
    linkFindMany.mockResolvedValue([link("a"), link("b"), link("c")]);
    eventFindMany.mockResolvedValue([
      { givingLinkId: "a", donationGivingLinkId: null, donationLinkIsExisting: false },
      { givingLinkId: "x", donationGivingLinkId: "b", donationLinkIsExisting: false },
      { givingLinkId: "y", donationGivingLinkId: "c", donationLinkIsExisting: true },
    ]);
    expect((await listMonthlyGiftLinkOptions("churchA")).map((o) => o.id)).toEqual(["c"]);
  });
});

describe("resolveEventDonationLink", () => {
  const base = { churchId: "churchA", ownerUserId: "u1", event };

  it("uses a chosen existing page as-is and flags it, creating nothing", async () => {
    linkFindMany.mockResolvedValue([link("a")]);
    const r = await resolveEventDonationLink({ ...base, chosenLinkId: "a", current: { id: null, isExisting: false } });
    expect(r).toEqual({ ok: true, id: "a", isExisting: true });
    expect(linkCreate).not.toHaveBeenCalled();
  });

  it("refuses a page that isn't on the eligible list (other church, inactive, event-owned)", async () => {
    linkFindMany.mockResolvedValue([link("a")]);
    const r = await resolveEventDonationLink({ ...base, chosenLinkId: "foreign", current: { id: null, isExisting: false } });
    expect(r.ok).toBe(false);
    expect(linkCreate).not.toHaveBeenCalled();
  });

  it("keeps its own dedicated page when nothing is chosen", async () => {
    linkFindFirst.mockResolvedValue({ id: "auto1" });
    const r = await resolveEventDonationLink({ ...base, chosenLinkId: null, current: { id: "auto1", isExisting: false } });
    expect(r).toEqual({ ok: true, id: "auto1", isExisting: false });
    expect(linkCreate).not.toHaveBeenCalled();
  });

  it("creates a dedicated page when none exists yet, or when switching back from an existing page", async () => {
    expect(await resolveEventDonationLink({ ...base, chosenLinkId: null, current: { id: null, isExisting: false } })).toEqual({ ok: true, id: "auto1", isExisting: false });
    expect(await resolveEventDonationLink({ ...base, chosenLinkId: null, current: { id: "a", isExisting: true } })).toEqual({ ok: true, id: "auto1", isExisting: false });
    expect(linkCreate).toHaveBeenCalledTimes(2);
  });

  it("does nothing when the monthly gift is off", async () => {
    const r = await resolveEventDonationLink({ ...base, event: { ...event, enabled: false }, chosenLinkId: "a", current: { id: "a", isExisting: true } });
    expect(r).toEqual({ ok: true, id: "a", isExisting: true });
    expect(linkCreate).not.toHaveBeenCalled();
    expect(linkFindMany).not.toHaveBeenCalled();
  });
});
