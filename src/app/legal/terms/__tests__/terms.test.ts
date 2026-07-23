import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const source = readFileSync(join(__dirname, "../page.tsx"), "utf-8");

describe("TermsPage Compliance Section", () => {
  it("contains section with anchor ID nonprofit-eligibility-and-verification", () => {
    expect(source).toContain('id="nonprofit-eligibility-and-verification"');
  });

  it("contains exact heading Nonprofit Eligibility and Verification", () => {
    expect(source).toContain("Nonprofit Eligibility and Verification");
  });

  it("contains Google Pay nonprofit verification policy requirements", () => {
    expect(source).toContain("WGC Payments provides donation-processing services exclusively to validated, registered nonprofit organizations.");
    expect(source).toContain("Before an organization is approved to accept donations, including donations made using Google Pay");
    expect(source).toContain("Section 501(c)(3)");
    expect(source).toContain("Employer Identification Number (EIN)");
    expect(source).toContain("IRS Tax Exempt Organization Search");
  });
});
