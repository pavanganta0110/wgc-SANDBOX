import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const del = vi.fn();
const deleteMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { inboxMailbox: { findUnique: (...a: unknown[]) => findUnique(...a), delete: (...a: unknown[]) => del(...a) }, inboxMessage: { deleteMany: (...a: unknown[]) => deleteMany(...a) }, auditLog: { create: vi.fn() } },
}));
vi.mock("@/lib/auth/requireAdminSession", () => ({ requireMfaVerifiedAdminSession: async () => ({ userId: "admin-a", email: "a@wgc.test" }) }));

import { DELETE } from "@/app/api/admin/inbox/mailboxes/[id]/route";

const call = () => DELETE(new Request("http://x", { method: "DELETE" }), { params: Promise.resolve({ id: "mb" }) });

describe("disconnect route", () => {
  beforeEach(() => {
    findUnique.mockReset();
    del.mockReset();
    deleteMany.mockReset();
  });
  it("refuses a shared mailbox", async () => {
    findUnique.mockResolvedValue({ id: "mb", emailAddress: "s@x.com", ownerAdminUserId: null });
    expect((await call()).status).toBe(404);
    expect(del).not.toHaveBeenCalled();
  });
  it("refuses another admin's personal mailbox", async () => {
    findUnique.mockResolvedValue({ id: "mb", emailAddress: "b@x.com", ownerAdminUserId: "admin-b" });
    expect((await call()).status).toBe(404);
    expect(del).not.toHaveBeenCalled();
  });
  it("lets the owner disconnect their own mailbox and deletes the copied mail", async () => {
    findUnique.mockResolvedValue({ id: "mb", emailAddress: "a@x.com", ownerAdminUserId: "admin-a" });
    expect((await call()).status).toBe(200);
    expect(deleteMany).toHaveBeenCalled();
    expect(del).toHaveBeenCalled();
  });
});
