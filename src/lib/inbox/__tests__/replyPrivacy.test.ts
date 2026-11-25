import { describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const create = vi.fn();
const sendMail = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { inboxMessage: { findUnique: (...a: unknown[]) => findUnique(...a), create: (...a: unknown[]) => create(...a), update: vi.fn() }, supportTicket: { findUnique: vi.fn() }, supportTicketMessage: { create: vi.fn() }, auditLog: { create: vi.fn() } } }));
vi.mock("@/lib/auth/requireAdminSession", () => ({ requireMfaVerifiedAdminSession: async () => ({ userId: "admin-a", email: "a@wgc.test" }) }));
vi.mock("@/lib/inbox/mailboxAuth", () => ({ accessTokenForMailbox: async () => "tok", mailboxDataCenter: () => "com" }));
vi.mock("@/lib/inbox/zoho", () => ({ sendMail: (...a: unknown[]) => sendMail(...a) }));

import { POST } from "@/app/api/admin/inbox/messages/[id]/reply/route";

describe("reply route privacy", () => {
  it("cannot reply from another admin's personal mailbox", async () => {
    findUnique.mockResolvedValue({ id: "m1", subject: "Hi", fromEmail: "x@y.com", ticketId: null, mailboxId: "mb", mailbox: { ownerAdminUserId: "admin-b", emailAddress: "b@x.com", dataCenter: "com", providerAccountId: "1" } });
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ text: "hello" }) }), { params: Promise.resolve({ id: "m1" }) });
    expect(res.status).toBe(404);
    expect(sendMail).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});
