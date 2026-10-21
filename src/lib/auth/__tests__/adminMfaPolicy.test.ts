import { describe, it, expect, afterEach } from "vitest";
import { isAdminMfaEnforced } from "../adminMfaPolicy";

describe("isAdminMfaEnforced (sandbox repository)", () => {
  const original = process.env.ADMIN_MFA_ENFORCEMENT;
  afterEach(() => {
    process.env.ADMIN_MFA_ENFORCEMENT = original;
  });

  it("is off by default (no SMS provider in the sandbox)", () => {
    delete process.env.ADMIN_MFA_ENFORCEMENT;
    expect(isAdminMfaEnforced()).toBe(false);
  });

  it("is on only when ADMIN_MFA_ENFORCEMENT is exactly \"on\"", () => {
    process.env.ADMIN_MFA_ENFORCEMENT = "on";
    expect(isAdminMfaEnforced()).toBe(true);
    process.env.ADMIN_MFA_ENFORCEMENT = "true";
    expect(isAdminMfaEnforced()).toBe(false);
  });
});
