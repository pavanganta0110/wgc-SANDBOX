import { describe, it, expect } from "vitest";
import { renderCampaignTemplate } from "../campaignTemplate";

const vars = { firstName: "Jordan", churchName: "Grace Fellowship", link: "https://wgcpayments.com/gc/abc123" };

describe("renderCampaignTemplate", () => {
  it("renders {{orgName}} — the current, composer-facing merge field", () => {
    expect(renderCampaignTemplate("Hi {{firstName}}, {{orgName}} says thanks! {{link}}", vars)).toBe(
      "Hi Jordan, Grace Fellowship says thanks! https://wgcpayments.com/gc/abc123"
    );
  });

  it("still renders the legacy {{churchName}} token — a campaign drafted before the orgName rename must not break", () => {
    expect(renderCampaignTemplate("Hi {{firstName}}, {{churchName}} says thanks! {{link}}", vars)).toBe(
      "Hi Jordan, Grace Fellowship says thanks! https://wgcpayments.com/gc/abc123"
    );
  });

  it("renders both tokens to the same value if a template somehow mixes them", () => {
    expect(renderCampaignTemplate("{{orgName}} / {{churchName}}", vars)).toBe("Grace Fellowship / Grace Fellowship");
  });

  it("leaves an unrecognized token untouched", () => {
    expect(renderCampaignTemplate("Hi {{nickname}}", vars)).toBe("Hi {{nickname}}");
  });
});
