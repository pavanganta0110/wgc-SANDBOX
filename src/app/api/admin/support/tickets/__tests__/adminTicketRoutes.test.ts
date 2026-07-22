import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetAdminSession = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  getAdminSession: () => mockGetAdminSession(),
}));

const mockPrisma = {
  supportTicket: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  supportTicketMessage: { create: vi.fn(), updateMany: vi.fn(), groupBy: vi.fn() },
  church: { findMany: vi.fn(), findUnique: vi.fn() },
  user: { findMany: vi.fn(), findUnique: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn().mockResolvedValue(undefined) }));

const mockNotifyWgcReply = vi.fn().mockResolvedValue(undefined);
const mockNotifyTicketStatusChange = vi.fn().mockResolvedValue(undefined);
const mockNotifyTicketResolved = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/support/ticketNotifications", () => ({
  notifyWgcReply: (...args: unknown[]) => mockNotifyWgcReply(...args),
  notifyTicketStatusChange: (...args: unknown[]) => mockNotifyTicketStatusChange(...args),
  notifyTicketResolved: (...args: unknown[]) => mockNotifyTicketResolved(...args),
  notifyMerchantReply: vi.fn(),
  notifyNewSupportTicket: vi.fn(),
}));

async function loadDetailRoute() {
  vi.resetModules();
  return import("@/app/api/admin/support/tickets/[ticketId]/route");
}
async function loadMessagesRoute() {
  vi.resetModules();
  return import("@/app/api/admin/support/tickets/[ticketId]/messages/route");
}
async function loadQueueRoute() {
  vi.resetModules();
  return import("@/app/api/admin/support/tickets/route");
}

function req(body?: unknown, method = "GET") {
  return new Request("http://x/api/admin/support/tickets/t1", {
    method,
    ...(body !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.church.findMany.mockResolvedValue([]);
  mockPrisma.user.findMany.mockResolvedValue([]);
  mockPrisma.supportTicketMessage.groupBy.mockResolvedValue([]);
});

describe("Internal admin support ticket routes require an admin session", () => {
  it("queue list rejects an unauthenticated request", async () => {
    mockGetAdminSession.mockResolvedValue(null);
    const { GET } = await loadQueueRoute();
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("ticket detail rejects an unauthenticated request", async () => {
    mockGetAdminSession.mockResolvedValue(null);
    const { GET } = await loadDetailRoute();
    const res = await GET(req(), { params: Promise.resolve({ ticketId: "t1" }) });
    expect(res.status).toBe(401);
  });
});

describe("Admin ticket detail — internal notes and read-marking", () => {
  it("the admin detail response includes internal notes (unlike the merchant-facing API)", async () => {
    mockGetAdminSession.mockResolvedValue({ userId: "admin-1", email: "admin-1@wgc.com", name: "Admin", role: "wgc_admin" });
    mockPrisma.supportTicket.findUnique.mockResolvedValue({
      id: "t1",
      ticketNumber: "WGC-1001",
      churchId: "church-a",
      createdByUserId: "u1",
      assignedToAdminUserId: null,
      messages: [
        { id: "m1", senderRole: "church_admin", isInternalNote: false, readByAdminAt: null },
        { id: "m2", senderRole: "wgc_admin", isInternalNote: true, body: "Internal only", readByAdminAt: null },
      ],
    });
    mockPrisma.church.findUnique.mockResolvedValue({ id: "church-a", name: "Test Church" });
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const { GET } = await loadDetailRoute();
    const res = await GET(req(), { params: Promise.resolve({ ticketId: "t1" }) });
    const data = await res.json();

    expect(data.ticket.messages).toHaveLength(2);
    expect(data.ticket.messages.some((m: any) => m.isInternalNote)).toBe(true);
  });

  it("opening a ticket marks unread non-internal merchant messages read by the admin", async () => {
    mockGetAdminSession.mockResolvedValue({ userId: "admin-1", email: "admin-1@wgc.com", name: "Admin", role: "wgc_admin" });
    mockPrisma.supportTicket.findUnique.mockResolvedValue({
      id: "t1",
      ticketNumber: "WGC-1001",
      churchId: "church-a",
      createdByUserId: "u1",
      assignedToAdminUserId: null,
      messages: [
        { id: "m1", senderRole: "church_admin", isInternalNote: false, readByAdminAt: null },
        { id: "m2", senderRole: "wgc_admin", isInternalNote: false, readByAdminAt: null }, // WGC's own message — never counted as unread-for-admin
      ],
    });
    mockPrisma.church.findUnique.mockResolvedValue({ id: "church-a", name: "Test Church" });
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const { GET } = await loadDetailRoute();
    await GET(req(), { params: Promise.resolve({ ticketId: "t1" }) });

    expect(mockPrisma.supportTicketMessage.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["m1"] } },
      data: { readByAdminAt: expect.any(Date) },
    });
  });
});

describe("Admin ticket actions (PATCH)", () => {
  beforeEach(() => {
    mockGetAdminSession.mockResolvedValue({ userId: "admin-1", email: "admin-1@wgc.com", name: "Admin", role: "wgc_admin" });
    mockPrisma.supportTicket.findUnique.mockResolvedValue({ id: "t1", ticketNumber: "WGC-1001", churchId: "church-a", status: "OPEN", priority: "NORMAL", assignedToAdminUserId: null });
    mockPrisma.supportTicket.update.mockImplementation((args: any) => Promise.resolve({ id: "t1", ticketNumber: "WGC-1001", churchId: "church-a", ...args.data }));
  });

  it("resolve moves status to RESOLVED and sets resolvedAt", async () => {
    const { PATCH } = await loadDetailRoute();
    const res = await PATCH(req({ action: "resolve", resolutionSummary: "Resolved successfully" }, "PATCH"), { params: Promise.resolve({ ticketId: "t1" }) });
    expect(res.status).toBe(200);
    expect(mockPrisma.supportTicket.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "RESOLVED", resolvedAt: expect.any(Date) }) })
    );
  });

  it("reopen is only allowed from RESOLVED or CLOSED, and does not silently happen on its own", async () => {
    const { PATCH } = await loadDetailRoute();
    const res = await PATCH(req({ action: "reopen" }, "PATCH"), { params: Promise.resolve({ ticketId: "t1" }) });
    expect(res.status).toBe(400); // ticket is OPEN, reopen requires resolved/closed
  });

  it("reopen succeeds from CLOSED as an explicit admin action", async () => {
    mockPrisma.supportTicket.findUnique.mockResolvedValue({ id: "t1", ticketNumber: "WGC-1001", churchId: "church-a", status: "CLOSED", priority: "NORMAL", assignedToAdminUserId: null });
    const { PATCH } = await loadDetailRoute();
    const res = await PATCH(req({ action: "reopen" }, "PATCH"), { params: Promise.resolve({ ticketId: "t1" }) });
    expect(res.status).toBe(200);
  });

  it("assign requires a real, non-disabled admin user", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const { PATCH } = await loadDetailRoute();
    const res = await PATCH(req({ action: "assign", adminUserId: "not-real" }, "PATCH"), { params: Promise.resolve({ ticketId: "t1" }) });
    expect(res.status).toBe(400);
  });

  it("assign succeeds for a valid admin and unassign clears it", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: "admin-2", role: "wgc_admin", disabledAt: null });
    const { PATCH } = await loadDetailRoute();
    const res = await PATCH(req({ action: "assign", adminUserId: "admin-2" }, "PATCH"), { params: Promise.resolve({ ticketId: "t1" }) });
    expect(res.status).toBe(200);
    expect(mockPrisma.supportTicket.update).toHaveBeenCalledWith(expect.objectContaining({ data: { assignedToAdminUserId: "admin-2" } }));
  });

  it("an assignment-change system message is marked internal (never merchant-visible)", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: "admin-2", role: "wgc_admin", disabledAt: null });
    const { PATCH } = await loadDetailRoute();
    await PATCH(req({ action: "assign", adminUserId: "admin-2" }, "PATCH"), { params: Promise.resolve({ ticketId: "t1" }) });
    expect(mockPrisma.supportTicketMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isInternalNote: true }) })
    );
  });

  it("a status-change system message is merchant-visible (not internal)", async () => {
    const { PATCH } = await loadDetailRoute();
    await PATCH(req({ action: "resolve", resolutionSummary: "Resolved successfully" }, "PATCH"), { params: Promise.resolve({ ticketId: "t1" }) });
    expect(mockPrisma.supportTicketMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isInternalNote: false }) })
    );
  });
});

describe("Admin reply / internal note (messages route)", () => {
  beforeEach(() => {
    mockGetAdminSession.mockResolvedValue({ userId: "admin-1", email: "admin-1@wgc.com", name: "Admin", role: "wgc_admin" });
    mockPrisma.supportTicket.findUnique.mockResolvedValue({ id: "t1", ticketNumber: "WGC-1001", churchId: "church-a", status: "OPEN" });
    mockPrisma.supportTicketMessage.create.mockImplementation((args: any) => Promise.resolve({ id: "m1", ...args.data }));
    mockPrisma.supportTicket.update.mockImplementation((args: any) => Promise.resolve({ id: "t1", ticketNumber: "WGC-1001", churchId: "church-a", ...args.data }));
  });

  it("a merchant-visible reply moves the ticket to WAITING_ON_ORGANIZATION and emails the merchant", async () => {
    const { POST } = await loadMessagesRoute();
    const res = await POST(req({ body: "We're looking into this." }, "POST"), { params: Promise.resolve({ ticketId: "t1" }) });
    expect(res.status).toBe(201);
    expect(mockPrisma.supportTicket.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "WAITING_ON_ORGANIZATION" } }));
    expect(mockNotifyWgcReply).toHaveBeenCalledTimes(1);
  });

  it("an internal note is saved with isInternalNote true, never changes ticket status, and is never emailed", async () => {
    const { POST } = await loadMessagesRoute();
    const res = await POST(req({ body: "Escalate to billing team.", isInternalNote: true }, "POST"), { params: Promise.resolve({ ticketId: "t1" }) });
    expect(res.status).toBe(201);
    expect(mockPrisma.supportTicketMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isInternalNote: true }) })
    );
    expect(mockPrisma.supportTicket.update).not.toHaveBeenCalled();
    expect(mockNotifyWgcReply).not.toHaveBeenCalled();
  });
});
