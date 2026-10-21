import { describe, it, expect, vi, beforeEach } from "vitest";

// PUT /api/merchant/events/[eventId]/fundraiser — assigns an event's gifts to
// a team member by setting the owner of the event's own giving pages.
let session: Record<string, unknown>;
vi.mock("@/lib/auth/requireMerchantSession", () => ({ requireMerchantSession: async () => session }));
const logDashboardAction = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: (...a: unknown[]) => logDashboardAction(...a) }));

const eventFindFirst = vi.fn();
const linkFindMany = vi.fn();
const linkUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
const userFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: { findFirst: (...a: unknown[]) => eventFindFirst(...a) },
    givingLink: { findMany: (...a: unknown[]) => linkFindMany(...a), updateMany: (...a: unknown[]) => linkUpdateMany(...a) },
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
  },
}));

const ctx = (eventId = "evA") => ({ params: Promise.resolve({ eventId }) });
const put = (body: unknown) => new Request("http://localhost/x", { method: "PUT", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
function signIn(role: string, permissionsJson: unknown = null) {
  session = { userId: "u-owner", email: "o@a.com", churchId: "churchA", rawRole: role, role, isWgcAdmin: false, permissionsJson, authVersion: 1, authTime: null };
}

beforeEach(() => {
  vi.clearAllMocks();
  signIn("owner");
  eventFindFirst.mockResolvedValue({ id: "evA", churchId: "churchA", givingLinkId: "glTicket", donationGivingLinkId: "glDonate", donationLinkIsExisting: false });
  linkFindMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) =>
    where.id.in.map((id) => ({ id, ownerUserId: "u-owner", churchId: "churchA" })),
  );
  userFindUnique.mockResolvedValue({ id: "u-fund", churchId: "churchA", disabledAt: null });
});

describe("assign event fundraiser", () => {
  it("moves the event's ticket and own donation page to the fundraiser and audits it", async () => {
    const { PUT } = await import("@/app/api/merchant/events/[eventId]/fundraiser/route");
    const res = await PUT(put({ userId: "u-fund" }), ctx());
    expect(res.status).toBe(200);
    expect(linkUpdateMany).toHaveBeenCalledWith({ where: { id: { in: ["glTicket", "glDonate"] }, churchId: "churchA" }, data: { ownerUserId: "u-fund" } });
    expect(logDashboardAction.mock.calls[0][0]).toMatchObject({ action: "EVENT_FUNDRAISER_ASSIGNED", entityId: "evA" });
  });

  it("never changes an organization's existing giving page used as the donation page", async () => {
    eventFindFirst.mockResolvedValue({ id: "evA", churchId: "churchA", givingLinkId: "glTicket", donationGivingLinkId: "glOrgPage", donationLinkIsExisting: true });
    const { PUT } = await import("@/app/api/merchant/events/[eventId]/fundraiser/route");
    await PUT(put({ userId: "u-fund" }), ctx());
    expect(linkUpdateMany.mock.calls[0][0].where.id.in).toEqual(["glTicket"]);
  });

  it("refuses fundraisers, and admins who can't edit all giving pages", async () => {
    const { PUT } = await import("@/app/api/merchant/events/[eventId]/fundraiser/route");
    signIn("fundraiser");
    expect((await PUT(put({ userId: "u-fund" }), ctx())).status).toBe(403);
    signIn("admin", { canEditAllGivingLinks: false });
    expect((await PUT(put({ userId: "u-fund" }), ctx())).status).toBe(403);
    expect(linkUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses a user from another organization, and a foreign event is 404", async () => {
    const { PUT } = await import("@/app/api/merchant/events/[eventId]/fundraiser/route");
    userFindUnique.mockResolvedValue({ id: "u-x", churchId: "churchB", disabledAt: null });
    expect((await PUT(put({ userId: "u-x" }), ctx())).status).toBe(403);
    eventFindFirst.mockResolvedValue(null);
    expect((await PUT(put({ userId: "u-fund" }), ctx("evB"))).status).toBe(404);
    expect(eventFindFirst.mock.calls[eventFindFirst.mock.calls.length - 1][0].where).toEqual({ id: "evB", churchId: "churchA" });
    expect(linkUpdateMany).not.toHaveBeenCalled();
  });
});
