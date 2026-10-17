/* eslint-disable @typescript-eslint/no-explicit-any -- loose Prisma mocks */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, any>;
const db = { church: null as Row | null, pref: null as Row | null, users: new Map<string, Row>() };
vi.mock("@/lib/prisma", () => ({
  prisma: {
    church: { findUnique: async () => db.church },
    notificationPreference: { findUnique: async () => db.pref },
    user: { findUnique: async ({ where }: any) => db.users.get(where.id) ?? null },
  },
}));
const send = vi.fn(async (..._a: unknown[]) => ({ success: true }));
vi.mock("@/lib/email", () => ({ sendWgcEmail: (...a: unknown[]) => send(...a) }));

import { notifyEvent } from "../notificationDispatch";

const base = { churchId: "c1", eventKey: "DONATION_RECEIVED", subject: "New donation received: $100.00", title: "t", badgeText: "b", badgeColor: "#000", bodyHtml: "<p>x</p>" };
const sentTo = () => (send.mock.calls[0]?.[0] as any)?.to;

beforeEach(() => {
  send.mockClear();
  db.pref = { emailEnabled: true };
  db.church = { primaryOwnerUserId: "owner1", supportEmail: null, financeEmail: null, primaryContactEmail: "admin@church.org", name: "Church" };
  db.users = new Map<string, Row>([
    ["owner1", { email: "admin@church.org", disabledAt: null, role: "owner", churchId: "c1" }],
    ["staff1", { email: "treasurer@church.org", disabledAt: null, role: "church_admin", churchId: "c1" }],
    ["wgc1", { email: "collin@wgcpayments.com", disabledAt: null, role: "wgc_super_admin", churchId: null }],
    ["wgc2", { email: "support@wgcpayments.com", disabledAt: null, role: "wgc_admin", churchId: "c1" }],
    ["other1", { email: "someone@otherchurch.org", disabledAt: null, role: "owner", churchId: "c2" }],
    ["off1", { email: "gone@church.org", disabledAt: new Date(), role: "church_admin", churchId: "c1" }],
  ]);
});

describe("notifyEvent recipient", () => {
  it("goes to the church's own staff member the gift is credited to", async () => {
    await notifyEvent({ ...base, recipientUserId: "staff1" });
    expect(sentTo()).toBe("treasurer@church.org");
  });

  it("with nobody credited, goes to the church's owner", async () => {
    await notifyEvent(base);
    expect(sentTo()).toBe("admin@church.org");
  });

  it("a gift credited to a WGC super admin (e.g. a link Collin owns) goes to the church's OWNER, not to WGC staff", async () => {
    await notifyEvent({ ...base, recipientUserId: "wgc1" });
    expect(sentTo()).toBe("admin@church.org");
  });

  it("a WGC admin is skipped even if their account is tied to this church", async () => {
    await notifyEvent({ ...base, recipientUserId: "wgc2" });
    expect(sentTo()).toBe("admin@church.org");
  });

  it("a user from a different organization is never the recipient", async () => {
    await notifyEvent({ ...base, recipientUserId: "other1" });
    expect(sentTo()).toBe("admin@church.org");
  });

  it("a disabled staff member falls back to the owner", async () => {
    await notifyEvent({ ...base, recipientUserId: "off1" });
    expect(sentTo()).toBe("admin@church.org");
  });

  it("falls back to the contact emails when the owner is missing, still never to WGC staff", async () => {
    db.church!.primaryOwnerUserId = null;
    await notifyEvent({ ...base, recipientUserId: "wgc1" });
    expect(sentTo()).toBe("admin@church.org");
  });

  it("still respects the church turning the notice off, and still sends nothing without any address", async () => {
    db.pref = { emailEnabled: false };
    await notifyEvent({ ...base, recipientUserId: "wgc1" });
    expect(send).not.toHaveBeenCalled();
    db.pref = { emailEnabled: true };
    db.church = { primaryOwnerUserId: null, supportEmail: null, financeEmail: null, primaryContactEmail: null, name: "x" };
    await notifyEvent({ ...base, recipientUserId: "wgc1" });
    expect(send).not.toHaveBeenCalled();
  });
});
