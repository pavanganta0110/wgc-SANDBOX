import { describe, it, expect } from "vitest";
import { navHrefsFor, parsePartnerType, isPartnerType } from "@/lib/partners/partnerType";

describe("partner type", () => {
  it("defaults anything unknown to a software partner, so every existing partner is unchanged", () => {
    expect(parsePartnerType(undefined)).toBe("SOFTWARE");
    expect(parsePartnerType("anything")).toBe("SOFTWARE");
    expect(parsePartnerType("REFERRAL")).toBe("REFERRAL");
    expect(isPartnerType("REFERRAL")).toBe(true);
    expect(isPartnerType("ISO")).toBe(false);
  });

  it("a software partner keeps its CRM menu and gets no commission pages", () => {
    const m = navHrefsFor("SOFTWARE", false);
    expect(m).toEqual(expect.arrayContaining(["/partner/organizations", "/partner/api-keys", "/partner/webhook", "/partner/menu", "/partner/billing", "/partner/docs"]));
    for (const h of ["/partner/commissions", "/partner/volume", "/partner/transactions"]) expect(m).not.toContain(h);
  });

  it("a referral partner gets volume, transactions, commission and team, and none of the CRM pages", () => {
    const m = navHrefsFor("REFERRAL", false);
    expect(m).toEqual(["/partner/volume", "/partner/transactions", "/partner/commissions", "/partner/team"]);
    for (const h of ["/partner/api-keys", "/partner/webhook", "/partner/menu", "/partner/billing", "/partner/docs", "/partner/organizations"]) expect(m).not.toContain(h);
  });

  it("an agent gets only the pages for their own clients, whatever the partner type", () => {
    for (const t of ["SOFTWARE", "REFERRAL"] as const) expect(navHrefsFor(t, true)).toEqual(["/partner/volume", "/partner/transactions", "/partner/commissions"]);
  });
});
