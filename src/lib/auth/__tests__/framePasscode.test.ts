import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({ user: { findUnique: vi.fn(), update: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { checkFramePasscode, hashFramePasscode, validateFramePasscode, FRAME_PASSCODE_MAX_ATTEMPTS, FRAME_PASSCODE_LOCK_MINUTES } from "../framePasscode";

describe("validateFramePasscode", () => {
  it("accepts a reasonable passcode", () => {
    expect(validateFramePasscode("river-stone-42")).toBeNull();
    expect(validateFramePasscode("482916")).toBeNull();
  });
  it("refuses short, long, repeated, common and non-text passcodes", () => {
    expect(validateFramePasscode("12345")).toMatch(/at least 6/);
    expect(validateFramePasscode("x".repeat(65))).toMatch(/at most 64/);
    expect(validateFramePasscode("aaaaaa")).toMatch(/too easy/);
    expect(validateFramePasscode("123456")).toMatch(/too easy/);
    expect(validateFramePasscode("Password")).toMatch(/too easy/);
    expect(validateFramePasscode(undefined)).toMatch(/Enter a passcode/);
    expect(validateFramePasscode(123456)).toMatch(/Enter a passcode/);
  });
});

describe("checkFramePasscode", () => {
  const now = new Date("2026-10-30T12:00:00Z");
  let hash: string;
  beforeEach(async () => {
    vi.clearAllMocks();
    hash = await hashFramePasscode("river-stone-42");
    prismaMock.user.update.mockResolvedValue({});
  });
  const user = (over: Record<string, unknown> = {}) => ({ framePasscodeHash: hash, framePasscodeFailedAttempts: 0, framePasscodeLockedUntil: null, ...over });

  it("accepts the right passcode and clears earlier wrong tries", async () => {
    prismaMock.user.findUnique.mockResolvedValue(user({ framePasscodeFailedAttempts: 3 }));
    expect(await checkFramePasscode("u1", "river-stone-42", now)).toEqual({ ok: true });
    expect(prismaMock.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { framePasscodeFailedAttempts: 0, framePasscodeLockedUntil: null } });
  });

  it("counts a wrong passcode on the person", async () => {
    prismaMock.user.findUnique.mockResolvedValue(user());
    expect(await checkFramePasscode("u1", "wrong-one", now)).toEqual({ ok: false, reason: "invalid" });
    expect(prismaMock.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { framePasscodeFailedAttempts: 1 } });
  });

  it("locks after the allowed number of wrong tries", async () => {
    prismaMock.user.findUnique.mockResolvedValue(user({ framePasscodeFailedAttempts: FRAME_PASSCODE_MAX_ATTEMPTS - 1 }));
    expect(await checkFramePasscode("u1", "wrong-one", now)).toEqual({ ok: false, reason: "locked" });
    const data = prismaMock.user.update.mock.calls[0][0].data;
    expect(data.framePasscodeFailedAttempts).toBe(0);
    expect(data.framePasscodeLockedUntil.getTime()).toBe(now.getTime() + FRAME_PASSCODE_LOCK_MINUTES * 60 * 1000);
  });

  it("refuses even the right passcode while locked, and counts nothing more", async () => {
    prismaMock.user.findUnique.mockResolvedValue(user({ framePasscodeLockedUntil: new Date(now.getTime() + 60_000) }));
    expect(await checkFramePasscode("u1", "river-stone-42", now)).toEqual({ ok: false, reason: "locked" });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("accepts again once the lock has passed", async () => {
    prismaMock.user.findUnique.mockResolvedValue(user({ framePasscodeLockedUntil: new Date(now.getTime() - 1000) }));
    expect(await checkFramePasscode("u1", "river-stone-42", now)).toEqual({ ok: true });
  });

  it("a person with no passcode set can never sign in, and the try is counted", async () => {
    prismaMock.user.findUnique.mockResolvedValue(user({ framePasscodeHash: null }));
    expect(await checkFramePasscode("u1", "anything-here", now)).toEqual({ ok: false, reason: "invalid" });
    expect(prismaMock.user.update).toHaveBeenCalled();
  });

  it("an unknown person is refused", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    expect(await checkFramePasscode("nope", "river-stone-42", now)).toEqual({ ok: false, reason: "invalid" });
  });
});
