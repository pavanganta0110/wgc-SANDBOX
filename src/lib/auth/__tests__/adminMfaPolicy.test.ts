import { describe, it, expect, afterEach } from "vitest";
import { isAdminMfaEnforced } from "@/lib/auth/adminMfaPolicy";

const saved = { flag: process.env.ADMIN_MFA_ENFORCEMENT, env: process.env.NEXT_PUBLIC_FINIX_ENV };
afterEach(() => {
  for (const [k, v] of [["ADMIN_MFA_ENFORCEMENT", saved.flag], ["NEXT_PUBLIC_FINIX_ENV", saved.env]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

// Sandbox repository only: no SMS provider, so admin two-factor is opt-in.
describe("isAdminMfaEnforced (sandbox)", () => {
  it("is off by default, whatever the Finix environment says", () => {
    delete process.env.ADMIN_MFA_ENFORCEMENT;
    for (const env of [undefined, "sandbox", "live"]) {
      if (env === undefined) delete process.env.NEXT_PUBLIC_FINIX_ENV;
      else process.env.NEXT_PUBLIC_FINIX_ENV = env;
      expect(isAdminMfaEnforced()).toBe(false);
    }
  });

  it("an old 'off' value keeps it off", () => {
    process.env.ADMIN_MFA_ENFORCEMENT = "off";
    expect(isAdminMfaEnforced()).toBe(false);
  });

  it("turns on only with an exact 'on'", () => {
    process.env.ADMIN_MFA_ENFORCEMENT = "on";
    expect(isAdminMfaEnforced()).toBe(true);
    for (const v of ["ON", "true", "1", ""]) {
      process.env.ADMIN_MFA_ENFORCEMENT = v;
      expect(isAdminMfaEnforced()).toBe(false);
    }
  });
});
