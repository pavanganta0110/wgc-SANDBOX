import { describe, it, expect } from "vitest";
import { teamInvitationStatus } from "../teamInvitationStatus";

const now = new Date("2026-11-26T12:00:00Z");
const future = new Date("2026-12-01T00:00:00Z");
const past = new Date("2026-11-01T00:00:00Z");

describe("teamInvitationStatus", () => {
  it("is accepted once a password is set", () => {
    expect(teamInvitationStatus({ passwordHash: "h", lastLoginAt: null, setPasswordTokenExpiresAt: past }, now)).toBe("ACCEPTED");
  });

  it("is accepted for someone who signed in without a password (a person opened inside a partner's frame)", () => {
    expect(teamInvitationStatus({ passwordHash: null, lastLoginAt: new Date("2026-11-25T00:00:00Z"), setPasswordTokenExpiresAt: future }, now)).toBe("ACCEPTED");
  });

  it("is pending while an unused invitation is still valid", () => {
    expect(teamInvitationStatus({ passwordHash: null, lastLoginAt: null, setPasswordTokenExpiresAt: future }, now)).toBe("PENDING");
  });

  it("is expired when the invitation ran out or there is none, and the person never signed in", () => {
    expect(teamInvitationStatus({ passwordHash: null, lastLoginAt: null, setPasswordTokenExpiresAt: past }, now)).toBe("EXPIRED");
    expect(teamInvitationStatus({ passwordHash: null, lastLoginAt: null, setPasswordTokenExpiresAt: null }, now)).toBe("EXPIRED");
  });
});
