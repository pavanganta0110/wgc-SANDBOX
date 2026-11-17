import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Finix can ask a merchant for more information more than once. Each request issues a new upload link and voids
 * the last one, so the email must go out each time. Before, the email was sent once per application and a second
 * request left the merchant with a dead link and no email (Collegiate Impact, 2026-11-14).
 */
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("@/lib/billing/wgcSubscriptionWebhook", () => ({ handleWgcSubscriptionWebhookEvent: vi.fn() }));
const sendWgcEmail = vi.hoisted(() => vi.fn().mockResolvedValue({ success: true, data: {} }));
vi.mock("@/lib/email", () => ({ sendWgcEmail, sendWgcAdminEmail: vi.fn() }));

const tx = vi.hoisted(() => ({ $queryRaw: vi.fn(), emailLog: { findFirst: vi.fn(), create: vi.fn() } }));
const prismaMock = vi.hoisted(() => ({ $transaction: vi.fn(), emailLog: { update: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { sendWebhookEmail } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));
  tx.$queryRaw.mockResolvedValue([{ locked: true }]);
  tx.emailLog.create.mockResolvedValue({ id: "log1" });
  prismaMock.emailLog.update.mockResolvedValue({});
});

const send = (repeatAfterMs?: number) => sendWebhookEmail("app1", "MORE_INFORMATION_REQUIRED", "m@example.test", "s", "t", "b", "#fff", "<p>x</p>", repeatAfterMs);

describe("sendWebhookEmail repeat window", () => {
  it("by default, one email of a type per application", async () => {
    tx.emailLog.findFirst.mockResolvedValue({ id: "old" });
    await send();
    expect(sendWgcEmail).not.toHaveBeenCalled();
    expect(tx.emailLog.findFirst.mock.calls[0][0].where).toEqual({ onboardingApplicationId: "app1", type: "MORE_INFORMATION_REQUIRED" });
  });

  it("with a window, only a recent log counts, so a later request is emailed", async () => {
    tx.emailLog.findFirst.mockResolvedValue(null);
    await send(600000);
    const where = tx.emailLog.findFirst.mock.calls[0][0].where;
    expect(where.createdAt.gt).toBeInstanceOf(Date);
    expect(Date.now() - where.createdAt.gt.getTime()).toBeGreaterThanOrEqual(600000 - 1000);
    expect(sendWgcEmail).toHaveBeenCalledTimes(1);
  });

  it("with a window, a redelivery inside it is still not sent twice", async () => {
    tx.emailLog.findFirst.mockResolvedValue({ id: "recent" });
    await send(600000);
    expect(sendWgcEmail).not.toHaveBeenCalled();
  });
});
