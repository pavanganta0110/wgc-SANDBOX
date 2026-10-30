import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "./password";

/**
 * A passcode for signing in from inside a partner's frame, when the partner's own product has one shared
 * login and cannot say who is opening WGC. The organization sets each person's passcode; it is hashed like
 * a password, works only in the frame and never for a normal WGC sign-in. Wrong tries are counted on the
 * person, so guessing is slow whatever link or address it comes from.
 */

export const FRAME_PASSCODE_MIN_LENGTH = 6;
export const FRAME_PASSCODE_MAX_LENGTH = 64;
export const FRAME_PASSCODE_MAX_ATTEMPTS = 5;
export const FRAME_PASSCODE_LOCK_MINUTES = 15;

const TOO_COMMON = new Set(["123456", "1234567", "12345678", "123456789", "654321", "000000", "111111", "222222", "333333", "444444", "555555", "666666", "777777", "888888", "999999", "password", "passcode", "qwerty", "abc123", "121212", "112233"]);

/** The reason a passcode is not acceptable, or null when it is. */
export function validateFramePasscode(value: unknown): string | null {
  if (typeof value !== "string") return "Enter a passcode.";
  if (value.length < FRAME_PASSCODE_MIN_LENGTH) return `The passcode must be at least ${FRAME_PASSCODE_MIN_LENGTH} characters.`;
  if (value.length > FRAME_PASSCODE_MAX_LENGTH) return `The passcode must be at most ${FRAME_PASSCODE_MAX_LENGTH} characters.`;
  if (/^(.)\1+$/.test(value) || TOO_COMMON.has(value.toLowerCase())) return "That passcode is too easy to guess. Choose another.";
  return null;
}

export function hashFramePasscode(passcode: string): Promise<string> {
  return hashPassword(passcode);
}

// Checked against when a person has no passcode, so a missing person or passcode takes as long as a wrong one.
let decoyHash: Promise<string> | null = null;
const decoy = () => (decoyHash ??= hashPassword("decoy-passcode-not-a-real-one"));

/** For an email that is not on the team: takes as long as a real check, so the answer does not give it away. */
export async function spendDecoyPasscodeCheck(passcode: string): Promise<void> {
  await verifyPassword(passcode, await decoy());
}

export type FramePasscodeCheck = { ok: true } | { ok: false; reason: "invalid" | "locked" };

/** Checks a person's passcode, counting the wrong tries and locking after too many. */
export async function checkFramePasscode(userId: string, passcode: string, now: Date = new Date()): Promise<FramePasscodeCheck> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { framePasscodeHash: true, framePasscodeFailedAttempts: true, framePasscodeLockedUntil: true },
  });
  if (!user) {
    await verifyPassword(passcode, await decoy());
    return { ok: false, reason: "invalid" };
  }
  if (user.framePasscodeLockedUntil && user.framePasscodeLockedUntil > now) {
    await verifyPassword(passcode, await decoy());
    return { ok: false, reason: "locked" };
  }

  const matches = await verifyPassword(passcode, user.framePasscodeHash ?? (await decoy()));
  if (matches && user.framePasscodeHash) {
    if (user.framePasscodeFailedAttempts > 0 || user.framePasscodeLockedUntil) {
      await prisma.user.update({ where: { id: userId }, data: { framePasscodeFailedAttempts: 0, framePasscodeLockedUntil: null } });
    }
    return { ok: true };
  }

  const attempts = user.framePasscodeFailedAttempts + 1;
  const lock = attempts >= FRAME_PASSCODE_MAX_ATTEMPTS;
  await prisma.user.update({
    where: { id: userId },
    data: lock
      ? { framePasscodeFailedAttempts: 0, framePasscodeLockedUntil: new Date(now.getTime() + FRAME_PASSCODE_LOCK_MINUTES * 60 * 1000) }
      : { framePasscodeFailedAttempts: attempts },
  });
  return { ok: false, reason: lock ? "locked" : "invalid" };
}
