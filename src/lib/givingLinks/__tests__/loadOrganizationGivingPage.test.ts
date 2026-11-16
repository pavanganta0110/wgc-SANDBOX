import { describe, it, expect, vi, beforeEach } from "vitest";

const mockChurch = vi.fn();
const mockLinks = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { church: { findUnique: (...a: unknown[]) => mockChurch(...a) }, givingLink: { findMany: (...a: unknown[]) => mockLinks(...a) } },
}));
const mockLoad = vi.fn();
vi.mock("@/lib/givingLinks/loadPublicGivingPageData", () => ({ loadPublicGivingPageData: (...a: unknown[]) => mockLoad(...a) }));

import { loadOrganizationGivingPage } from "../loadOrganizationGivingPage";

const ok = (slug: string) => ({ ok: true, link: { publicSlug: slug } });

describe("loadOrganizationGivingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChurch.mockResolvedValue({ id: "c1" });
    mockLinks.mockResolvedValue([{ publicSlug: "NEW" }, { publicSlug: "OLD" }]);
    mockLoad.mockImplementation(async (s: string) => ok(s));
  });

  it("returns notFound for an unknown organization", async () => {
    mockChurch.mockResolvedValue(null);
    expect(await loadOrganizationGivingPage("nope")).toEqual({ ok: false, notFound: true });
    expect(mockLinks).not.toHaveBeenCalled();
  });

  it("only considers this organization's active, general-purpose links", async () => {
    await loadOrganizationGivingPage("acme");
    expect(mockLinks.mock.calls[0][0].where).toEqual({ churchId: "c1", status: "ACTIVE", fundraisingCampaignId: null, merchandiseEnabled: false });
  });

  it("uses the newest eligible link by default", async () => {
    const r = await loadOrganizationGivingPage("acme");
    expect(r.ok && r.linkSlug).toBe("NEW");
  });

  it("honors ?link= only when it is one of the organization's own links", async () => {
    expect((await loadOrganizationGivingPage("acme", "OLD")).ok && (await loadOrganizationGivingPage("acme", "OLD") as { linkSlug: string }).linkSlug).toBe("OLD");
    const r = await loadOrganizationGivingPage("acme", "SOMEONE_ELSES");
    expect(r.ok && r.linkSlug).toBe("NEW");
    expect(mockLoad).not.toHaveBeenCalledWith("SOMEONE_ELSES");
  });

  it("skips links the hosted page would refuse (not approved, event checkout, ...)", async () => {
    mockLoad.mockImplementation(async (s: string) => (s === "NEW" ? { ok: false, notFound: true } : ok(s)));
    const r = await loadOrganizationGivingPage("acme");
    expect(r.ok && r.linkSlug).toBe("OLD");
  });

  it("returns notFound when no link can be paid", async () => {
    mockLoad.mockResolvedValue({ ok: false, notFound: true });
    expect(await loadOrganizationGivingPage("acme")).toEqual({ ok: false, notFound: true });
  });
});
