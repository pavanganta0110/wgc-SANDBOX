import { describe, it, expect } from "vitest";
import { visibleNavItems, type NavAccess } from "@/components/merchant/Sidebar";

const access: NavAccess = {
  canViewEvents: true,
  canViewFundraisingCampaigns: true,
  canTakePayment: true,
  canViewFunds: true,
  canViewStudents: true,
  canViewBillingPlan: true,
};

const flatten = (items: ReturnType<typeof visibleNavItems>) =>
  items.flatMap((i) => [i.name, i.section, ...(i.children?.map((c) => c.name) ?? [])]);
const hrefs = (items: ReturnType<typeof visibleNavItems>) => items.flatMap((i) => [i.href, ...(i.children?.map((c) => c.href) ?? [])]);

describe("visibleNavItems in payment mode", () => {
  const normal = visibleNavItems("owner", access);
  const payment = visibleNavItems("owner", { ...access, paymentMode: true });

  it("is unchanged when payment mode is off", () => {
    expect(visibleNavItems("owner", { ...access, paymentMode: false })).toEqual(normal);
    expect(flatten(normal).join(" ")).toMatch(/Donors/);
    expect(flatten(normal).join(" ")).toMatch(/Giving Links/);
  });

  it("keeps the same links in the same order, so only wording changes", () => {
    expect(hrefs(payment)).toEqual(hrefs(normal));
    expect(payment.map((i) => i.access)).toEqual(normal.map((i) => i.access));
  });

  it("has no donor/donation/giving/gift wording left in the nav", () => {
    expect(flatten(payment).filter((label) => /donor|donat|giving|gift|give/i.test(label))).toEqual([]);
  });

  it("uses payer/payment labels", () => {
    const labels = flatten(payment);
    expect(labels).toEqual(expect.arrayContaining(["Payers", "Payment Links", "Payment Campaigns", "Payments"]));
  });

  it("does not change what a role can see", () => {
    expect(visibleNavItems("viewer", { ...access, paymentMode: true }).map((i) => i.href)).toEqual(
      visibleNavItems("viewer", access).map((i) => i.href)
    );
  });
});
