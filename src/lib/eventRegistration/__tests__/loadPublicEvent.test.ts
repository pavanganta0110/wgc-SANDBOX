import { describe, it, expect, vi, beforeEach } from "vitest";

const eventFindUnique = vi.fn();
const churchFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: { findUnique: (...a: unknown[]) => eventFindUnique(...a) },
    church: { findUnique: (...a: unknown[]) => churchFindUnique(...a) },
  },
}));

import { loadPublicEvent } from "@/lib/eventRegistration/loadPublicEvent";

beforeEach(() => {
  eventFindUnique.mockReset();
  churchFindUnique.mockReset();
  churchFindUnique.mockResolvedValue(null); // stops after the visibility gate; we only test the gate
});

describe("loadPublicEvent visibility gate", () => {
  it("hides a missing or archived event from everyone", async () => {
    eventFindUnique.mockResolvedValue(null);
    expect(await loadPublicEvent("x", new Date(), { previewChurchId: "A" })).toEqual({ ok: false });
    eventFindUnique.mockResolvedValue({ churchId: "A", status: "ACTIVE", archivedAt: new Date() });
    expect(await loadPublicEvent("x", new Date(), { previewChurchId: "A" })).toEqual({ ok: false });
    expect(churchFindUnique).not.toHaveBeenCalled();
  });

  it.each(["DRAFT", "INACTIVE"])("hides a %s event from the public and from other organizations", async (status) => {
    eventFindUnique.mockResolvedValue({ churchId: "A", status, archivedAt: null });
    expect(await loadPublicEvent("x")).toEqual({ ok: false });
    expect(await loadPublicEvent("x", new Date(), { previewChurchId: "B" })).toEqual({ ok: false });
    expect(churchFindUnique).not.toHaveBeenCalled();
  });

  it("lets the owning organization's signed-in staff past the gate for a draft", async () => {
    eventFindUnique.mockResolvedValue({ churchId: "A", status: "DRAFT", archivedAt: null });
    await loadPublicEvent("x", new Date(), { previewChurchId: "A" });
    expect(churchFindUnique).toHaveBeenCalledWith({ where: { id: "A" } });
  });

  it("lets anyone past the gate for an active event", async () => {
    eventFindUnique.mockResolvedValue({ churchId: "A", status: "ACTIVE", archivedAt: null });
    await loadPublicEvent("x");
    expect(churchFindUnique).toHaveBeenCalled();
  });
});
