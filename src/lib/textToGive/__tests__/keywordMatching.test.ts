import { describe, it, expect } from "vitest";
import { normalizeKeyword, buildDefaultReplyMessage } from "../keywordMatching";

describe("normalizeKeyword", () => {
  it("uppercases and strips non-alphanumeric characters", () => {
    expect(normalizeKeyword(" building! ")).toBe("BUILDING");
    expect(normalizeKeyword("Give-2026")).toBe("GIVE2026");
  });

  it("returns an empty string for a purely punctuation input", () => {
    expect(normalizeKeyword("!!!")).toBe("");
  });
});

describe("buildDefaultReplyMessage", () => {
  it("includes the church name, campaign name, and give URL", () => {
    const msg = buildDefaultReplyMessage({ churchName: "Grace Church", campaignName: "New Roof Fund", giveUrl: "https://wgcpayments.com/c/new-roof" });
    expect(msg).toContain("Grace Church");
    expect(msg).toContain("New Roof Fund");
    expect(msg).toContain("https://wgcpayments.com/c/new-roof");
  });
});
