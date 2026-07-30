import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    church: { findUnique: vi.fn() },
    user: { findMany: vi.fn() },
    emailLog: { create: vi.fn() },
  },
}));
vi.mock("@/lib/email", () => ({ sendWgcEmail: vi.fn() }));

async function importDeps() {
  const { prisma } = await import("@/lib/prisma");
  const { sendWgcEmail } = await import("@/lib/email");
  return { prisma, sendWgcEmail };
}

describe("notifySyncNeedsReview", () => {
  beforeEach(() => vi.clearAllMocks());

  it("emails every owner/admin user for the church", async () => {
    const { prisma, sendWgcEmail } = await importDeps();
    vi.mocked(prisma.church.findUnique).mockResolvedValue({ name: "First Church" } as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { name: "Alice", email: "alice@church.org" },
      { name: "Bob", email: "bob@church.org" },
    ] as never);
    vi.mocked(sendWgcEmail).mockResolvedValue({ success: true } as never);
    vi.mocked(prisma.emailLog.create).mockResolvedValue({} as never);

    const { notifySyncNeedsReview } = await import("../notifications");
    await notifySyncNeedsReview("church-1", "stl_1", "Needs manual verification.");

    expect(sendWgcEmail).toHaveBeenCalledTimes(2);
    expect(vi.mocked(sendWgcEmail).mock.calls.map((c) => c[0].to)).toEqual(["alice@church.org", "bob@church.org"]);
  });

  it("only queries owner/admin roles, not fundraiser/viewer", async () => {
    const { prisma, sendWgcEmail } = await importDeps();
    vi.mocked(prisma.church.findUnique).mockResolvedValue({ name: "First Church" } as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([] as never);
    vi.mocked(sendWgcEmail).mockResolvedValue({ success: true } as never);

    const { notifySyncNeedsReview } = await import("../notifications");
    await notifySyncNeedsReview("church-1", "stl_1", "msg");

    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ role: { in: ["owner", "admin"] } }) }));
  });

  it("also notifies SUPPORT_EMAIL when configured", async () => {
    const original = process.env.SUPPORT_EMAIL;
    process.env.SUPPORT_EMAIL = "support@wgcpayments.com";
    try {
      const { prisma, sendWgcEmail } = await importDeps();
      vi.mocked(prisma.church.findUnique).mockResolvedValue({ name: "First Church" } as never);
      vi.mocked(prisma.user.findMany).mockResolvedValue([] as never);
      vi.mocked(sendWgcEmail).mockResolvedValue({ success: true } as never);
      vi.mocked(prisma.emailLog.create).mockResolvedValue({} as never);

      const { notifySyncNeedsReview } = await import("../notifications");
      await notifySyncNeedsReview("church-1", "stl_1", "msg");

      expect(vi.mocked(sendWgcEmail).mock.calls.some((c) => c[0].to === "support@wgcpayments.com")).toBe(true);
    } finally {
      process.env.SUPPORT_EMAIL = original;
    }
  });

  it("logs a failed attempt to EmailLog rather than throwing when sendWgcEmail fails", async () => {
    const { prisma, sendWgcEmail } = await importDeps();
    vi.mocked(prisma.church.findUnique).mockResolvedValue({ name: "First Church" } as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ name: "Alice", email: "alice@church.org" }] as never);
    vi.mocked(sendWgcEmail).mockResolvedValue({ success: false, error: "provider down" } as never);
    vi.mocked(prisma.emailLog.create).mockResolvedValue({} as never);

    const { notifySyncNeedsReview } = await import("../notifications");
    await expect(notifySyncNeedsReview("church-1", "stl_1", "msg")).resolves.toBeUndefined();
    expect(prisma.emailLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }));
  });

  it("never throws even if the database lookup itself fails", async () => {
    const { prisma } = await importDeps();
    vi.mocked(prisma.church.findUnique).mockRejectedValue(new Error("db down"));

    const { notifySyncNeedsReview } = await import("../notifications");
    await expect(notifySyncNeedsReview("church-1", "stl_1", "msg")).resolves.toBeUndefined();
  });
});

describe("notifySyncFailed", () => {
  beforeEach(() => vi.clearAllMocks());

  it("emails owner/admin users and never contacts SUPPORT_EMAIL", async () => {
    const original = process.env.SUPPORT_EMAIL;
    process.env.SUPPORT_EMAIL = "support@wgcpayments.com";
    try {
      const { prisma, sendWgcEmail } = await importDeps();
      vi.mocked(prisma.church.findUnique).mockResolvedValue({ name: "First Church" } as never);
      vi.mocked(prisma.user.findMany).mockResolvedValue([{ name: "Alice", email: "alice@church.org" }] as never);
      vi.mocked(sendWgcEmail).mockResolvedValue({ success: true } as never);
      vi.mocked(prisma.emailLog.create).mockResolvedValue({} as never);

      const { notifySyncFailed } = await import("../notifications");
      await notifySyncFailed("church-1", "stl_1", "msg");

      expect(sendWgcEmail).toHaveBeenCalledTimes(1);
      expect(vi.mocked(sendWgcEmail).mock.calls[0][0].to).toBe("alice@church.org");
    } finally {
      process.env.SUPPORT_EMAIL = original;
    }
  });

  it("never throws even if the database lookup itself fails", async () => {
    const { prisma } = await importDeps();
    vi.mocked(prisma.church.findUnique).mockRejectedValue(new Error("db down"));

    const { notifySyncFailed } = await import("../notifications");
    await expect(notifySyncFailed("church-1", "stl_1", "msg")).resolves.toBeUndefined();
  });
});
