import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  supportTicket: { count: vi.fn(), create: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

async function loadModule() {
  vi.resetModules();
  return import("@/lib/support/ticketNumber");
}

beforeEach(() => vi.clearAllMocks());

describe("createSupportTicketWithNumber", () => {
  it("generates a WGC-#### ticket number derived from the current ticket count", async () => {
    mockPrisma.supportTicket.count.mockResolvedValue(1000);
    mockPrisma.supportTicket.create.mockImplementation((args: any) => Promise.resolve({ id: "t1", ...args.data }));
    const { createSupportTicketWithNumber } = await loadModule();

    const ticket = await createSupportTicketWithNumber({ churchId: "church-a", subject: "Test", category: "OTHER", description: "d", priority: "NORMAL" } as any);

    expect(ticket.ticketNumber).toBe("WGC-2001");
  });

  it("retries with a new candidate number on a unique-constraint collision, and succeeds", async () => {
    mockPrisma.supportTicket.count.mockResolvedValue(0);
    let attempt = 0;
    mockPrisma.supportTicket.create.mockImplementation((args: any) => {
      attempt += 1;
      if (attempt === 1) {
        const err: any = new Error("Unique constraint failed");
        err.code = "P2002";
        throw err;
      }
      return Promise.resolve({ id: "t1", ...args.data });
    });
    const { createSupportTicketWithNumber } = await loadModule();

    const ticket = await createSupportTicketWithNumber({ churchId: "church-a", subject: "Test", category: "OTHER", description: "d", priority: "NORMAL" } as any);

    expect(attempt).toBe(2);
    expect(ticket.ticketNumber).toBe("WGC-1002");
  });

  it("two concurrent creations never produce the same ticket number (simulated race via a shared uniqueness set)", async () => {
    const usedNumbers = new Set<string>();
    mockPrisma.supportTicket.count.mockResolvedValue(0);
    mockPrisma.supportTicket.create.mockImplementation((args: any) => {
      if (usedNumbers.has(args.data.ticketNumber)) {
        const err: any = new Error("Unique constraint failed");
        err.code = "P2002";
        throw err;
      }
      usedNumbers.add(args.data.ticketNumber);
      return Promise.resolve({ id: `t-${args.data.ticketNumber}`, ...args.data });
    });
    const { createSupportTicketWithNumber } = await loadModule();

    const [a, b] = await Promise.all([
      createSupportTicketWithNumber({ churchId: "church-a", subject: "A", category: "OTHER", description: "d", priority: "NORMAL" } as any),
      createSupportTicketWithNumber({ churchId: "church-a", subject: "B", category: "OTHER", description: "d", priority: "NORMAL" } as any),
    ]);

    expect(a.ticketNumber).not.toBe(b.ticketNumber);
  });

  it("gives up after repeated collisions rather than retrying forever", async () => {
    mockPrisma.supportTicket.count.mockResolvedValue(0);
    mockPrisma.supportTicket.create.mockImplementation(() => {
      const err: any = new Error("Unique constraint failed");
      err.code = "P2002";
      throw err;
    });
    const { createSupportTicketWithNumber } = await loadModule();

    await expect(
      createSupportTicketWithNumber({ churchId: "church-a", subject: "Test", category: "OTHER", description: "d", priority: "NORMAL" } as any)
    ).rejects.toThrow();
  });
});
