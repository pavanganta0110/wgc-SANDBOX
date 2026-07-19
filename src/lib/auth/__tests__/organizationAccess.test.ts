import { describe, it, expect } from "vitest";
import { requireOrganizationAccess } from "@/lib/auth/organizationAccess";
import { ForbiddenError } from "@/lib/auth/errors";
import type { MerchantAuthContext } from "@/lib/auth/requireMerchantSession";

function makeAuth(churchId: string): MerchantAuthContext {
  return {
    userId: "u1",
    email: "a@b.com",
    churchId,
    rawRole: "owner",
    role: "owner",
    isWgcAdmin: false,
    permissionsJson: null,
    authVersion: 1,
  };
}

describe("requireOrganizationAccess", () => {
  it("rejects a resource belonging to a different church", () => {
    const auth = makeAuth("church-a");
    expect(() => requireOrganizationAccess(auth, "church-b")).toThrow(ForbiddenError);
  });

  it("rejects a null/missing resourceChurchId", () => {
    const auth = makeAuth("church-a");
    expect(() => requireOrganizationAccess(auth, null)).toThrow(ForbiddenError);
    expect(() => requireOrganizationAccess(auth, undefined)).toThrow(ForbiddenError);
  });

  it("allows a resource belonging to the same church", () => {
    const auth = makeAuth("church-a");
    expect(() => requireOrganizationAccess(auth, "church-a")).not.toThrow();
  });
});
