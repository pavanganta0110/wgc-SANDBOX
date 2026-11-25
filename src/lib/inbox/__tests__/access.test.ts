import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const update = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { inboxMessage: { findUnique: (...a: unknown[]) => findUnique(...a), update: (...a: unknown[]) => update(...a) }, inboxSenderRule: { upsert: vi.fn() } } }));
let sessionUser = "admin-a";
vi.mock("@/lib/auth/requireAdminSession", () => ({ requireMfaVerifiedAdminSession: async () => ({ userId: sessionUser, email: `${sessionUser}@wgc.test` }) }));
vi.mock("@/lib/inbox/tickets", () => ({ createTicketFromInboxMessage: vi.fn() }));

import { canAccessMailbox, visibleMailboxWhere } from "../access";
import { POST as actionPost } from "@/app/api/admin/inbox/messages/[id]/action/route";

describe("canAccessMailbox", () => {
  it("shared mailboxes are visible to every admin", () => {
    expect(canAccessMailbox({ ownerAdminUserId: null }, "admin-a")).toBe(true);
    expect(canAccessMailbox({ ownerAdminUserId: null }, "admin-b")).toBe(true);
  });
  it("a personal mailbox is visible only to its owner", () => {
    expect(canAccessMailbox({ ownerAdminUserId: "admin-a" }, "admin-a")).toBe(true);
    expect(canAccessMailbox({ ownerAdminUserId: "admin-a" }, "admin-b")).toBe(false);
  });
  it("visibleMailboxWhere lists shared plus own only", () => {
    expect(visibleMailboxWhere("admin-b")).toEqual({ OR: [{ ownerAdminUserId: null }, { ownerAdminUserId: "admin-b" }] });
  });
});

describe("inbox action route privacy", () => {
  beforeEach(() => {
    findUnique.mockReset();
    update.mockReset();
    sessionUser = "admin-a";
  });
  const call = (action: string) => actionPost(new Request("http://x", { method: "POST", body: JSON.stringify({ action }) }), { params: Promise.resolve({ id: "m1" }) });

  it("another admin's personal message looks like it does not exist and is never touched", async () => {
    findUnique.mockResolvedValue({ id: "m1", fromEmail: "x@y.com", mailbox: { ownerAdminUserId: "admin-b" } });
    const res = await call("ignore");
    expect(res.status).toBe(404);
    expect(update).not.toHaveBeenCalled();
  });
  it("the owner can act on their own personal message", async () => {
    findUnique.mockResolvedValue({ id: "m1", fromEmail: "x@y.com", mailbox: { ownerAdminUserId: "admin-a" } });
    const res = await call("ignore");
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalled();
  });
  it("spam / not spam / assign are refused on personal mail so it can never change shared rules", async () => {
    findUnique.mockResolvedValue({ id: "m1", fromEmail: "x@y.com", mailbox: { ownerAdminUserId: "admin-a" } });
    for (const a of ["spam", "not_spam", "assign_me"]) expect((await call(a)).status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });
  it("shared messages stay actionable by any admin", async () => {
    sessionUser = "admin-c";
    findUnique.mockResolvedValue({ id: "m1", fromEmail: "x@y.com", mailbox: { ownerAdminUserId: null } });
    expect((await call("ignore")).status).toBe(200);
  });
});
