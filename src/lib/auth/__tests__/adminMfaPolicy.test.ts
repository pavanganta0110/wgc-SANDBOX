import { describe, it, expect, afterEach } from "vitest";
import { isAdminMfaEnforced } from "@/lib/auth/adminMfaPolicy";

const saved = { flag: process.env.ADMIN_MFA_ENFORCEMENT, env: process.env.NEXT_PUBLIC_FINIX_ENV };
afterEach(() => {
  for (const [k, v] of [["ADMIN_MFA_ENFORCEMENT", saved.flag], ["NEXT_PUBLIC_FINIX_ENV", saved.env]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("isAdminMfaEnforced", () => {
  it("is on by default", () => {
    delete process.env.ADMIN_MFA_ENFORCEMENT;
    expect(isAdminMfaEnforced()).toBe(true);
  });

  it("only an exact 'off' on a non-live deployment turns it off", () => {
    process.env.NEXT_PUBLIC_FINIX_ENV = "sandbox";
    process.env.ADMIN_MFA_ENFORCEMENT = "off";
    expect(isAdminMfaEnforced()).toBe(false);
    for (const v of ["OFF", "false", "0", "", "disabled"]) {
      process.env.ADMIN_MFA_ENFORCEMENT = v;
      expect(isAdminMfaEnforced()).toBe(true);
    }
  });

  it("cannot be turned off on a live deployment", () => {
    process.env.NEXT_PUBLIC_FINIX_ENV = "live";
    process.env.ADMIN_MFA_ENFORCEMENT = "off";
    expect(isAdminMfaEnforced()).toBe(true);
  });
});
