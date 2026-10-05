import { describe, it, expect, vi, beforeEach } from "vitest";

// Merchant A is signed in. Every event route must scope by A's churchId from
// the session, answer 404 (never 403/200) for events owned by anyone else,
// and refuse roles without the matching event permission.
let session: Record<string, unknown>;
vi.mock("@/lib/auth/requireMerchantSession", () => ({ requireMerchantSession: async () => session }));
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn().mockResolvedValue(undefined) }));

const eventFindFirst = vi.fn();
const registrationFindMany = vi.fn().mockResolvedValue([]);
const attendeeFindMany = vi.fn().mockResolvedValue([]);
const attendeeFindFirst = vi.fn();
const attendeeUpdate = vi.fn();
const paymentFindMany = vi.fn().mockResolvedValue([]);
vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: { findFirst: (...a: unknown[]) => eventFindFirst(...a) },
    eventRegistration: { findMany: (...a: unknown[]) => registrationFindMany(...a), findFirst: vi.fn().mockResolvedValue({ id: "r1" }) },
    eventAttendee: { findMany: (...a: unknown[]) => attendeeFindMany(...a), findFirst: (...a: unknown[]) => attendeeFindFirst(...a), update: (...a: unknown[]) => attendeeUpdate(...a) },
    eventRegistrationAddOn: { findMany: vi.fn().mockResolvedValue([]) },
    payment: { findMany: (...a: unknown[]) => paymentFindMany(...a) },
  },
}));

const ctx = (eventId = "evB") => ({ params: Promise.resolve({ eventId }) });
const req = (method = "GET", body?: unknown) => new Request("http://localhost/x", { method, body: body ? JSON.stringify(body) : undefined, headers: { "Content-Type": "application/json" } });

function signIn(role: string) {
  session = { userId: "u1", email: "a@a.com", churchId: "churchA", rawRole: role, role, isWgcAdmin: false, permissionsJson: null, authVersion: 1, authTime: null };
}

beforeEach(() => {
  vi.clearAllMocks();
  eventFindFirst.mockResolvedValue(null); // the id belongs to someone else
  signIn("owner");
});

describe("another merchant's event", () => {
  it("is invisible to every read route and the export", async () => {
    const detail = await import("@/app/api/merchant/events/[eventId]/route");
    const regs = await import("@/app/api/merchant/events/[eventId]/registrations/route");
    const atts = await import("@/app/api/merchant/events/[eventId]/attendees/route");
    const exp = await import("@/app/api/merchant/events/[eventId]/export/route");
    for (const res of [await detail.GET(req(), ctx()), await regs.GET(req(), ctx()), await atts.GET(req(), ctx()), await exp.GET(req(), ctx())]) {
      expect(res.status).toBe(404);
    }
    expect(eventFindFirst).toHaveBeenCalledTimes(4);
    for (const call of eventFindFirst.mock.calls) expect(call[0].where).toEqual({ id: "evB", churchId: "churchA" });
    expect(registrationFindMany).not.toHaveBeenCalled();
    expect(attendeeFindMany).not.toHaveBeenCalled();
  });

  it("can't be edited, archived, emailed or have attendees checked in", async () => {
    const detail = await import("@/app/api/merchant/events/[eventId]/route");
    const emails = await import("@/app/api/merchant/events/[eventId]/emails/route");
    const checkin = await import("@/app/api/merchant/events/[eventId]/attendees/[attendeeId]/route");
    expect((await detail.PATCH(req("PATCH", { name: "x", startsAtLocal: "2030-01-01T10:00" }), ctx())).status).toBe(404);
    expect((await detail.DELETE(req("DELETE"), ctx())).status).toBe(404);
    expect((await emails.PUT(req("PUT", {}), ctx())).status).toBe(404);
    expect((await emails.POST(req("POST", { action: "send", kind: "reminder" }), ctx())).status).toBe(404);
    expect((await checkin.PATCH(req("PATCH", { checkedIn: true }), { params: Promise.resolve({ eventId: "evB", attendeeId: "a1" }) })).status).toBe(404);
    expect(attendeeUpdate).not.toHaveBeenCalled();
  });
});

describe("own event, scoped queries", () => {
  it("filters registrations and attendees by the session's church", async () => {
    eventFindFirst.mockResolvedValue({ id: "evA", churchId: "churchA", customFieldsJson: [], timezone: "America/Chicago", name: "Mine" });
    const regs = await import("@/app/api/merchant/events/[eventId]/registrations/route");
    const atts = await import("@/app/api/merchant/events/[eventId]/attendees/route");
    expect((await regs.GET(req(), ctx("evA"))).status).toBe(200);
    expect((await atts.GET(req(), ctx("evA"))).status).toBe(200);
    expect(registrationFindMany.mock.calls[0][0].where).toMatchObject({ churchId: "churchA", eventId: "evA" });
  });

  it("refuses to check in an attendee that isn't on this event/church", async () => {
    eventFindFirst.mockResolvedValue({ id: "evA", churchId: "churchA" });
    attendeeFindFirst.mockResolvedValue(null);
    const checkin = await import("@/app/api/merchant/events/[eventId]/attendees/[attendeeId]/route");
    const res = await checkin.PATCH(req("PATCH", { checkedIn: true }), { params: Promise.resolve({ eventId: "evA", attendeeId: "foreign" }) });
    expect(res.status).toBe(404);
    expect(attendeeFindFirst.mock.calls[0][0].where).toEqual({ id: "foreign", eventId: "evA", churchId: "churchA" });
  });
});

describe("permissions", () => {
  it("denies viewers and fundraisers by default on every event route", async () => {
    const list = await import("@/app/api/merchant/events/route");
    const exp = await import("@/app/api/merchant/events/[eventId]/export/route");
    const checkin = await import("@/app/api/merchant/events/[eventId]/attendees/[attendeeId]/route");
    for (const role of ["viewer", "fundraiser"]) {
      signIn(role);
      expect((await list.GET()).status).toBe(403);
      expect((await list.POST(req("POST", {}))).status).toBe(403);
      expect((await exp.GET(req(), ctx())).status).toBe(403);
      expect((await checkin.PATCH(req("PATCH", { checkedIn: true }), { params: Promise.resolve({ eventId: "e", attendeeId: "a" }) })).status).toBe(403);
    }
    expect(eventFindFirst).not.toHaveBeenCalled();
  });

  it("allows owners and admins to reach the routes", async () => {
    const list = await import("@/app/api/merchant/events/route");
    vi.doMock("@/lib/prisma", () => ({ prisma: {} }));
    for (const role of ["owner", "admin"]) {
      signIn(role);
      const { guardEventsRoute } = await import("@/lib/eventRegistration/merchantGuard");
      for (const key of ["canViewEvents", "canManageEvents", "canManageEventAttendees", "canExportEvents"] as const) {
        expect("auth" in (await guardEventsRoute(key))).toBe(true);
      }
    }
    expect(typeof list.GET).toBe("function");
  });
});
