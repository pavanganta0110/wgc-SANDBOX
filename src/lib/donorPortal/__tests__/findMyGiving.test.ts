import { describe, it, expect, vi, beforeEach } from "vitest";

const { prismaMock, sendWgcEmailMock } = vi.hoisted(() => ({
  prismaMock: { donor: { findMany: vi.fn() }, church: { findMany: vi.fn() } },
  sendWgcEmailMock: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/email", () => ({ sendWgcEmail: sendWgcEmailMock }));

import { findGivingPortalsByEmail, sendFindMyGivingEmail } from "../findMyGiving";
import { checkWindowRateLimit } from "../rateLimit";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");
  sendWgcEmailMock.mockResolvedValue({ success: true });
});

describe("findGivingPortalsByEmail", () => {
  it("matches active donors across churches, including legacy rows with no normalizedEmail", async () => {
    prismaMock.donor.findMany.mockResolvedValue([{ churchId: "c1" }, { churchId: "c2" }, { churchId: "c1" }]);
    prismaMock.church.findMany.mockResolvedValue([{ name: "Liberty", slug: "liberty" }]);
    await findGivingPortalsByEmail("  Ann@Example.com ");
    const where = prismaMock.donor.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ archivedAt: null, mergedIntoDonorId: null });
    expect(where.OR).toEqual([
      { normalizedEmail: "ann@example.com" },
      { normalizedEmail: null, email: { equals: "ann@example.com", mode: "insensitive" } },
    ]);
    expect(prismaMock.church.findMany.mock.calls[0][0].where).toEqual({ id: { in: ["c1", "c2"] }, finixMerchantId: { not: null } });
  });

  it("returns nothing for a blank email or no donors without querying churches", async () => {
    expect(await findGivingPortalsByEmail("  ")).toEqual([]);
    prismaMock.donor.findMany.mockResolvedValue([]);
    expect(await findGivingPortalsByEmail("a@b.co")).toEqual([]);
    expect(prismaMock.church.findMany).not.toHaveBeenCalled();
  });
});

describe("sendFindMyGivingEmail", () => {
  it("emails only the asking address, with one portal link per organization and no credentials", async () => {
    prismaMock.donor.findMany.mockResolvedValue([{ churchId: "c1" }, { churchId: "c2" }]);
    prismaMock.church.findMany.mockResolvedValue([{ name: "Liberty <B>", slug: "liberty" }, { name: "Grace", slug: "grace" }]);
    expect(await sendFindMyGivingEmail("ann@example.com")).toEqual({ sent: true });
    const mail = sendWgcEmailMock.mock.calls[0][0];
    expect(mail.to).toBe("ann@example.com");
    const hrefs = [...mail.bodyHtml.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(["https://app.example.com/give/liberty/account", "https://app.example.com/give/grace/account"]);
    expect(mail.bodyHtml).toContain("Liberty &lt;B&gt;");
    expect(mail.log).toBeUndefined(); // not a church-sent email, so never in any church's email log
  });

  it("sends nothing when no organization matched", async () => {
    prismaMock.donor.findMany.mockResolvedValue([]);
    expect(await sendFindMyGivingEmail("nobody@example.com")).toEqual({ sent: false });
    expect(sendWgcEmailMock).not.toHaveBeenCalled();
  });
});

describe("checkWindowRateLimit", () => {
  it("allows up to max inside the window, then blocks, per key", () => {
    const k = "k-" + Math.random();
    expect([1, 2, 3].map(() => checkWindowRateLimit(k, 3, 60_000))).toEqual([true, true, true]);
    expect(checkWindowRateLimit(k, 3, 60_000)).toBe(false);
    expect(checkWindowRateLimit("other-" + k, 3, 60_000)).toBe(true);
  });
  it("frees the key again after the window passes", () => {
    vi.useFakeTimers();
    const k = "w-" + Math.random();
    checkWindowRateLimit(k, 1, 1000);
    expect(checkWindowRateLimit(k, 1, 1000)).toBe(false);
    vi.advanceTimersByTime(1500);
    expect(checkWindowRateLimit(k, 1, 1000)).toBe(true);
    vi.useRealTimers();
  });
});
