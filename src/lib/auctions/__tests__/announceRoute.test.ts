import { describe, it, expect, vi, beforeEach } from "vitest";

const sendAnnouncementEmail = vi.hoisted(() => vi.fn().mockResolvedValue(true));
vi.mock("@/lib/auctions/auctionEmails", () => ({ sendAnnouncementEmail }));
vi.mock("@/lib/invoices/invoiceBranding", () => ({ resolveInvoiceBranding: vi.fn().mockResolvedValue({ organizationSupportEmail: "help@org.test" }) }));
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn() }));
const guard = vi.hoisted(() => ({ guardAuctionsRoute: vi.fn(), loadOwnedAuction: vi.fn(), auctionNotFound: vi.fn() }));
vi.mock("@/lib/auctions/merchantGuard", () => guard);
const prismaMock = vi.hoisted(() => ({ auctionBidder: { findMany: vi.fn(), count: vi.fn() }, auction: { updateMany: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { POST } from "@/app/api/merchant/auctions/[auctionId]/announce/route";

const auth = { churchId: "c1", userId: "u1", email: "me@org.test", rawRole: "owner" };
const updatedAt = new Date("2026-11-18T10:00:00Z");
const auction = (over: Record<string, unknown> = {}) => ({ id: "a1", churchId: "c1", title: "Gala", slug: "gala-1", status: "OPEN", updatedAt, emailSettingsJson: null, ...over });
const post = (body: unknown) => POST(new Request("https://x.test/a", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ auctionId: "a1" }) });
const good = { audience: "ALL", subject: "One hour left", message: "Bid now!" };

beforeEach(() => {
  vi.clearAllMocks();
  guard.guardAuctionsRoute.mockResolvedValue({ auth });
  guard.loadOwnedAuction.mockResolvedValue(auction());
  prismaMock.auctionBidder.findMany.mockResolvedValue([{ id: "b1", name: "A", email: "a@x.com" }, { id: "b2", name: "B", email: "b@x.com" }]);
  prismaMock.auction.updateMany.mockResolvedValue({ count: 1 });
});

describe("POST announce", () => {
  it("sends to each recipient, replies go to the organization, and the cooldown is recorded", async () => {
    const res = await post(good);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ sent: 2, failed: 0 });
    expect(sendAnnouncementEmail).toHaveBeenCalledTimes(2);
    expect(sendAnnouncementEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "a@x.com", subject: "One hour left", replyTo: "help@org.test" }));
    expect(prismaMock.auction.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "a1", churchId: "c1", updatedAt } }));
  });
  it("only ever looks at this organization's bidders in the chosen group", async () => {
    await post({ ...good, audience: "WAITING" });
    expect(prismaMock.auctionBidder.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { auctionId: "a1", churchId: "c1", status: { in: ["PENDING"] } } }));
  });
  it("refuses a second message inside ten minutes, and sends nothing", async () => {
    guard.loadOwnedAuction.mockResolvedValue(auction({ emailSettingsJson: { lastAnnouncementAt: new Date(Date.now() - 60_000).toISOString() } }));
    const res = await post(good);
    expect(res.status).toBe(429);
    expect(sendAnnouncementEmail).not.toHaveBeenCalled();
  });
  it("two sends at once cannot both go out: the loser's claim matches nothing", async () => {
    prismaMock.auction.updateMany.mockResolvedValue({ count: 0 });
    const res = await post(good);
    expect(res.status).toBe(409);
    expect(sendAnnouncementEmail).not.toHaveBeenCalled();
  });
  it("needs a subject, a message and a real group, and a published auction", async () => {
    expect((await post({ ...good, subject: " " })).status).toBe(400);
    expect((await post({ ...good, message: "" })).status).toBe(400);
    expect((await post({ ...good, audience: "EVERYONE" })).status).toBe(400);
    guard.loadOwnedAuction.mockResolvedValue(auction({ status: "DRAFT" }));
    expect((await post(good)).status).toBe(409);
    expect(sendAnnouncementEmail).not.toHaveBeenCalled();
  });
  it("says so when nobody is in the group, and counts addresses that could not be reached", async () => {
    prismaMock.auctionBidder.findMany.mockResolvedValue([]);
    expect((await post(good)).status).toBe(400);
    prismaMock.auctionBidder.findMany.mockResolvedValue([{ id: "b1", name: "A", email: "a@x.com" }, { id: "b2", name: "B", email: "b@x.com" }]);
    sendAnnouncementEmail.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await (await post(good)).json()).toMatchObject({ sent: 1, failed: 1 });
  });
  it("returns the guard's response when the person may not manage events", async () => {
    guard.guardAuctionsRoute.mockResolvedValue({ response: new Response("no", { status: 403 }) });
    expect((await post(good)).status).toBe(403);
    expect(prismaMock.auctionBidder.findMany).not.toHaveBeenCalled();
  });
});
