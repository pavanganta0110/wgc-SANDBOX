import { describe, it, expect } from "vitest";
import { BillingAccessRestrictedError, UnauthorizedError } from "@/lib/auth/errors";
import { isExpectedGuardrailError, routeWithoutQuery } from "../expectedErrors";

describe("isExpectedGuardrailError", () => {
  it("the billing gate is expected, not an error", () => {
    expect(isExpectedGuardrailError(new BillingAccessRestrictedError("APPROVED_BILLING_REQUIRED", "Finish setting up your billing."))).toBe(true);
  });

  it("a WGC staff account using a merchant page without support access is expected", () => {
    expect(isExpectedGuardrailError(new UnauthorizedError("WGC internal accounts cannot access merchant organization data through this session. Use the WGC support-access flow instead."))).toBe(true);
  });

  it("every other error is still reported, including other sign-in errors", () => {
    expect(isExpectedGuardrailError(new UnauthorizedError("Session is invalid or expired."))).toBe(false);
    expect(isExpectedGuardrailError(new Error("Finish setting up your WGC Platform subscription billing"))).toBe(false); // wrong type: not the gate
    expect(isExpectedGuardrailError(new Error("boom"))).toBe(false);
    expect(isExpectedGuardrailError("a string")).toBe(false);
    expect(isExpectedGuardrailError(null)).toBe(false);
  });
});

describe("routeWithoutQuery", () => {
  it("drops the query string, so one-time OAuth codes are never stored", () => {
    expect(routeWithoutQuery("/api/merchant/settings/integrations/quickbooks/callback?code=XAB1179&state=abc&realmId=913")).toBe("/api/merchant/settings/integrations/quickbooks/callback");
  });
  it("drops a fragment and leaves a clean path alone", () => {
    expect(routeWithoutQuery("/merchant/dashboard#top")).toBe("/merchant/dashboard");
    expect(routeWithoutQuery("/merchant/dashboard")).toBe("/merchant/dashboard");
    expect(routeWithoutQuery("/")).toBe("/");
  });
});
