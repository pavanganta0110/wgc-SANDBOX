import { describe, it, expect, vi, beforeEach } from "vitest";

const { prismaMock, sendWgcEmailMock, loadOptedOutMock } = vi.hoisted(() => ({
  prismaMock: {
    church: { findUnique: vi.fn() },
    orgEmailLog: { findMany: vi.fn() },
  },
  sendWgcEmailMock: vi.fn(),
  loadOptedOutMock: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/email", () => ({ sendWgcEmail: sendWgcEmailMock }));
vi.mock("@/lib/giving/emailOptOut", () => ({ loadOptedOutEmails: loadOptedOutMock }));

import { sendDonorPortalInvites, MAX_INVITES_PER_REQUEST, INVITE_RELATED_ENTITY_TYPE } from "../sendPortalInvites";

const church = { name: "Liberty <Baptist>", slug: "liberty", logoUrl: "/logo.png", primaryColor: "#0B5DBC", givingSupportEmail: "give@liberty.org", primaryContactEmail: "info@liberty.org" };
const base = { churchId: "church1", actorUserId: "user1", throttleMs: 7 * 24 * 3600 * 1000 };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.church.findUnique.mockResolvedValue(church);
  prismaMock.orgEmailLog.findMany.mockResolvedValue([]);
  loadOptedOutMock.mockResolvedValue(new Set());
  sendWgcEmailMock.mockResolvedValue({ success: true });
});

describe("sendDonorPortalInvites", () => {
  it("sends one email per donor, linking only to the church's portal page", async () => {
    const r = await sendDonorPortalInvites({ ...base, recipients: [{ donorId: "d1", email: "ann@example.com", name: "Ann Lee" }] });
    expect(r.sent).toBe(1);
    const mail = sendWgcEmailMock.mock.calls[0][0];
    expect(mail.to).toBe("ann@example.com");
    expect(mail.bodyHtml).toContain("/give/liberty/account");
    expect(mail.bodyHtml).toContain("Hi Ann,");
    expect(mail.replyTo).toBe("give@liberty.org");
    expect(mail.logoUrl).toMatch(/^https?:\/\/.+\/logo\.png$/);
  });

  it("never puts a credential in the email — no token, code or session in any link", async () => {
    await sendDonorPortalInvites({ ...base, recipients: [{ donorId: "d1", email: "ann@example.com", name: "Ann" }] });
    const hrefs = [...sendWgcEmailMock.mock.calls[0][0].bodyHtml.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const h of hrefs) expect(h).toMatch(/\/give\/liberty\/account$/);
  });

  it("escapes the organization and donor names in the HTML", async () => {
    await sendDonorPortalInvites({ ...base, recipients: [{ donorId: "d1", email: "x@example.com", name: "<script>alert(1)</script>" }] });
    const html = sendWgcEmailMock.mock.calls[0][0].bodyHtml;
    expect(html).not.toContain("<script>");
    expect(html).toContain("Liberty &lt;Baptist&gt;");
  });

  it("writes every send to the church's email log under the invite entity type", async () => {
    await sendDonorPortalInvites({ ...base, recipients: [{ donorId: "d1", email: "ann@example.com", name: "Ann" }] });
    expect(sendWgcEmailMock.mock.calls[0][0].log).toMatchObject({
      churchId: "church1", donorId: "d1", category: "OTHER", relatedEntityType: INVITE_RELATED_ENTITY_TYPE, createdByUserId: "user1",
    });
  });

  it("skips missing/invalid emails and duplicates (case-insensitive)", async () => {
    const r = await sendDonorPortalInvites({
      ...base,
      recipients: [
        { donorId: "a", email: null, name: null },
        { donorId: "b", email: "not-an-email", name: null },
        { donorId: "c", email: "Ann@Example.com", name: "Ann" },
        { donorId: "d", email: "ann@example.com ", name: "Ann again" },
      ],
    });
    expect(r.sent).toBe(1);
    expect(r.skipped).toMatchObject({ noEmail: 2, duplicate: 1 });
  });

  it("skips addresses that unsubscribed from this church", async () => {
    loadOptedOutMock.mockResolvedValue(new Set(["ann@example.com"]));
    const r = await sendDonorPortalInvites({ ...base, recipients: [{ donorId: "a", email: "ann@example.com", name: "Ann" }, { donorId: "b", email: "bob@example.com", name: "Bob" }] });
    expect(r.sent).toBe(1);
    expect(r.skipped.optedOut).toBe(1);
    expect(loadOptedOutMock).toHaveBeenCalledWith("church1", expect.any(Array));
    expect(sendWgcEmailMock.mock.calls.map((c) => c[0].to)).toEqual(["bob@example.com"]);
  });

  it("skips donors invited inside the throttle window, scoped to this church", async () => {
    prismaMock.orgEmailLog.findMany.mockResolvedValue([{ recipientEmail: "Ann@example.com" }]);
    const r = await sendDonorPortalInvites({ ...base, recipients: [{ donorId: "a", email: "ann@example.com", name: "Ann" }] });
    expect(r.sent).toBe(0);
    expect(r.skipped.recentlyInvited).toBe(1);
    expect(prismaMock.orgEmailLog.findMany.mock.calls[0][0].where).toMatchObject({ churchId: "church1", relatedEntityType: INVITE_RELATED_ENTITY_TYPE, status: "SENT" });
  });

  it("caps a request and reports how many remain", async () => {
    const recipients = Array.from({ length: MAX_INVITES_PER_REQUEST + 25 }, (_, i) => ({ donorId: `d${i}`, email: `u${i}@example.com`, name: `U${i}` }));
    const r = await sendDonorPortalInvites({ ...base, recipients });
    expect(r.sent).toBe(MAX_INVITES_PER_REQUEST);
    expect(r.remaining).toBe(25);
    expect(sendWgcEmailMock).toHaveBeenCalledTimes(MAX_INVITES_PER_REQUEST);
  });

  it("dry run counts but sends nothing", async () => {
    const r = await sendDonorPortalInvites({ ...base, dryRun: true, recipients: [{ donorId: "a", email: "ann@example.com", name: "Ann" }] });
    expect(r.sent).toBe(1);
    expect(sendWgcEmailMock).not.toHaveBeenCalled();
  });

  it("counts failures without stopping the rest", async () => {
    sendWgcEmailMock.mockResolvedValueOnce({ success: false }).mockRejectedValueOnce(new Error("boom")).mockResolvedValue({ success: true });
    const r = await sendDonorPortalInvites({
      ...base,
      recipients: [1, 2, 3].map((n) => ({ donorId: `d${n}`, email: `u${n}@example.com`, name: `U${n}` })),
    });
    expect(r).toMatchObject({ sent: 1, failed: 2 });
  });
});
