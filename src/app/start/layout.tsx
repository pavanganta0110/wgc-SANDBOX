import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Get Started | WGC Payments",
  description: "Start accepting low-cost ACH and card donations. Onboard your church, nonprofit, or 501(c) organization onto WGC's white-label payment rails.",
  alternates: { canonical: "/start" },
  openGraph: {
    images: [{ url: "/og/default.png", width: 1200, height: 630 }], title: "Get Started | WGC Payments", description: "Start accepting low-cost ACH and card donations. Onboard your church, nonprofit, or 501(c) organization onto WGC's white-label payment rails.", url: "https://wgcpayments.com/start" },
};

export default function StartLayout({ children }: { children: React.ReactNode }) {
  return children;
}
