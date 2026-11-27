import { describe, it, expect, beforeEach } from "vitest";
import { allowedSuccessReturnUrl, successRedirectHosts, successReturnTarget } from "../successReturn";

beforeEach(() => {
  delete process.env.GIVING_SUCCESS_REDIRECT_HOSTS;
});

describe("allowedSuccessReturnUrl", () => {
  it("allows only https pages on the scorecard's own hosts by default, so no other organization's donors are redirected", () => {
    expect(allowedSuccessReturnUrl("https://fund.wgcpayments.com/completescoreboard")).toBe("https://fund.wgcpayments.com/completescoreboard");
    expect(allowedSuccessReturnUrl("https://fund.wgcpaymentssandbox.com/completescoreboard")).toContain("fund.wgcpaymentssandbox.com");
    expect(allowedSuccessReturnUrl("https://yourchurch.org/thanks")).toBeNull();
    expect(allowedSuccessReturnUrl("https://evil.com/?fund.wgcpayments.com")).toBeNull();
    expect(allowedSuccessReturnUrl("https://fund.wgcpayments.com.evil.com/x")).toBeNull();
  });

  it("refuses http, other schemes, empty and garbage", () => {
    expect(allowedSuccessReturnUrl("http://fund.wgcpayments.com/x")).toBeNull();
    expect(allowedSuccessReturnUrl("javascript:alert(1)")).toBeNull();
    expect(allowedSuccessReturnUrl("")).toBeNull();
    expect(allowedSuccessReturnUrl(null)).toBeNull();
    expect(allowedSuccessReturnUrl("not a url")).toBeNull();
  });

  it("allows more hosts only when they are listed in the environment", () => {
    process.env.GIVING_SUCCESS_REDIRECT_HOSTS = "Thanks.Example.org, other.example.com";
    expect(successRedirectHosts()).toEqual(expect.arrayContaining(["thanks.example.org", "other.example.com", "fund.wgcpayments.com"]));
    expect(allowedSuccessReturnUrl("https://thanks.example.org/done")).not.toBeNull();
  });
});

describe("successReturnTarget", () => {
  it("adds the transfer id to the return URL, keeping what is already in it", () => {
    expect(successReturnTarget("https://fund.wgcpayments.com/completescoreboard?x=1", "TRabc123def456")).toBe(
      "https://fund.wgcpayments.com/completescoreboard?x=1&transfer_id=TRabc123def456"
    );
  });

  it("returns null with no transfer id, a malformed one, or a return URL that is not allowed", () => {
    expect(successReturnTarget("https://fund.wgcpayments.com/c", undefined)).toBeNull();
    expect(successReturnTarget("https://fund.wgcpayments.com/c", "TR bad&id")).toBeNull();
    expect(successReturnTarget("https://yourchurch.org/c", "TRabc123def456")).toBeNull();
    expect(successReturnTarget(null, "TRabc123def456")).toBeNull();
  });
});
