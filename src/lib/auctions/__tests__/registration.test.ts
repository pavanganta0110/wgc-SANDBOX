import { describe, it, expect, vi, beforeEach } from "vitest";
import { hashBidderCode } from "../bidderIdentity";

vi.mock("../auctionEmails", () => ({ sendBidderCodeEmail: vi.fn().mockResolvedValue(true), sendBidderApprovedEmail: vi.fn().mockResolvedValue(true), sendBidderDeclinedEmail: vi.fn().mockResolvedValue(true) }));

const prismaMock = vi.hoisted(() => ({
  auctionBidder: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), aggregate: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { requestBidderCode, verifyBidderCode } from "../registration";
import { sendBidderCodeEmail } from "../auctionEmails";

const now = new Date("2026-11-20T18:00:00Z");
const auction = { id: "a1", churchId: "c1", title: "Gala", slug: "gala-1", registrationMode: "OPEN" };
const stored = (over: Record<string, unknown> = {}) => ({
  id: "b1", name: "Jane", email: "jane@x.com", status: "PENDING", bidderNumber: null, emailVerifiedAt: null, verifyAttempts: 0,
  verifyCodeHash: hashBidderCode("123456", "a1", "jane@x.com"), verifyCodeExpiresAt: new Date(now.getTime() + 10 * 60_000), ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.auctionBidder.update.mockResolvedValue({});
  prismaMock.auctionBidder.aggregate.mockResolvedValue({ _max: { bidderNumber: null } });
});

describe("requestBidderCode", () => {
  it("rejects a bad email or missing name before anything is stored", async () => {
    expect((await requestBidderCode({ auction, name: "Jane", email: "nope", phone: null, now })).ok).toBe(false);
    expect((await requestBidderCode({ auction, name: "", email: "jane@x.com", phone: null, now })).ok).toBe(false);
    expect(prismaMock.auctionBidder.create).not.toHaveBeenCalled();
  });
  it("creates the registration for a new email and emails a code", async () => {
    prismaMock.auctionBidder.findUnique.mockResolvedValue(null);
    prismaMock.auctionBidder.create.mockResolvedValue(stored({ verifyCodeHash: null, verifyCodeExpiresAt: null }));
    expect(await requestBidderCode({ auction, name: "Jane", email: "Jane@X.com", phone: null, now })).toEqual({ ok: true });
    expect(prismaMock.auctionBidder.create).toHaveBeenCalledWith({ data: expect.objectContaining({ normalizedEmail: "jane@x.com", auctionId: "a1", churchId: "c1" }) });
    expect(sendBidderCodeEmail).toHaveBeenCalled();
  });
  it("sends no second code within a minute, and says nothing different about it", async () => {
    prismaMock.auctionBidder.findUnique.mockResolvedValue(stored({ verifyCodeExpiresAt: new Date(now.getTime() + 14.5 * 60_000) }));
    expect(await requestBidderCode({ auction, name: "Jane", email: "jane@x.com", phone: null, now })).toEqual({ ok: true });
    expect(sendBidderCodeEmail).not.toHaveBeenCalled();
  });
  it("a blocked person gets the same answer and no email", async () => {
    prismaMock.auctionBidder.findUnique.mockResolvedValue(stored({ status: "BLOCKED" }));
    expect(await requestBidderCode({ auction, name: "Jane", email: "jane@x.com", phone: null, now })).toEqual({ ok: true });
    expect(sendBidderCodeEmail).not.toHaveBeenCalled();
  });
});

describe("verifyBidderCode", () => {
  it("the right code signs the bidder in and, for an open auction, approves them with a number from 100", async () => {
    prismaMock.auctionBidder.findUnique.mockResolvedValue(stored());
    prismaMock.auctionBidder.findFirst.mockResolvedValue(stored());
    const result = await verifyBidderCode({ auction, email: "jane@x.com", code: "123456", now });
    expect(result).toMatchObject({ ok: true, status: "APPROVED", bidderNumber: 100 });
    expect(prismaMock.auctionBidder.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ verifyCodeHash: null, sessionTokenHash: expect.any(String) }) }));
  });
  it("for an approval auction the bidder is signed in but stays pending", async () => {
    prismaMock.auctionBidder.findUnique.mockResolvedValue(stored());
    const result = await verifyBidderCode({ auction: { ...auction, registrationMode: "APPROVAL" }, email: "jane@x.com", code: "123456", now });
    expect(result).toMatchObject({ ok: true, status: "PENDING", bidderNumber: null });
  });
  it("a wrong code counts an attempt and says nothing about why", async () => {
    prismaMock.auctionBidder.findUnique.mockResolvedValue(stored());
    const result = await verifyBidderCode({ auction, email: "jane@x.com", code: "000000", now });
    expect(result.ok).toBe(false);
    expect(prismaMock.auctionBidder.update).toHaveBeenCalledWith({ where: { id: "b1" }, data: { verifyAttempts: { increment: 1 } } });
  });
  it("is locked after five wrong tries, even with the right code, and after the code expires", async () => {
    prismaMock.auctionBidder.findUnique.mockResolvedValue(stored({ verifyAttempts: 5 }));
    expect((await verifyBidderCode({ auction, email: "jane@x.com", code: "123456", now })).ok).toBe(false);
    prismaMock.auctionBidder.findUnique.mockResolvedValue(stored({ verifyCodeExpiresAt: new Date(now.getTime() - 1) }));
    expect((await verifyBidderCode({ auction, email: "jane@x.com", code: "123456", now })).ok).toBe(false);
    expect(prismaMock.auctionBidder.update).not.toHaveBeenCalled();
  });
  it("a code for a different auction or email does not work", async () => {
    prismaMock.auctionBidder.findUnique.mockResolvedValue(stored({ verifyCodeHash: hashBidderCode("123456", "OTHER", "jane@x.com") }));
    expect((await verifyBidderCode({ auction, email: "jane@x.com", code: "123456", now })).ok).toBe(false);
  });
});
