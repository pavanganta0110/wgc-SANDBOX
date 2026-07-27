import type { Metadata } from "next";
import { CreditCard, Repeat, ShieldCheck, LayoutDashboard, Landmark, Banknote } from "lucide-react";
import AudienceLandingPage, { type AudienceLandingContent } from "@/components/marketing/AudienceLandingPage";

export const metadata: Metadata = {
  title: "Church Online Giving & Donation Processing | WGC Payments",
  description: "Accept tithes, offerings, and building-fund gifts online with low-cost ACH and card processing built for churches. Recurring giving, a merchant dashboard, and fast payouts.",
  openGraph: {
    title: "Church Online Giving & Donation Processing | WGC Payments",
    description: "Accept tithes, offerings, and building-fund gifts online with low-cost ACH and card processing built for churches.",
    url: "https://www.wgcpayments.com/for/churches",
  },
  alternates: { canonical: "/for/churches" },
};

const content: AudienceLandingContent = {
  eyebrow: "For Churches",
  headline: "Online giving built for",
  headlineAccent: "your church",
  intro: "Take tithes, offerings, and building-fund gifts online with low-cost ACH and card processing — designed for how congregations actually give, not retrofitted from generic ecommerce tools.",
  whoWeServeTitle: "Built for congregations of every size",
  whoWeServe: [
    "Single-campus and multi-site churches",
    "Church plants and growing congregations",
    "Denominational and network-affiliated churches",
    "Global faith networks with multiple giving locations",
    "Church management platforms embedding giving for their customers",
    "Ministries running building funds and capital campaigns",
  ],
  featuresTitle: "Everything your ministry needs",
  featuresSubtitle: "A complete giving ecosystem designed to facilitate generous giving without the headache of legacy processors.",
  features: [
    { icon: CreditCard, title: "Card and ACH giving", description: "Accept all major credit cards and low-cost ACH bank transfers directly from your congregation." },
    { icon: Repeat, title: "Recurring tithes & offerings", description: "Let members set up weekly, biweekly, or monthly recurring gifts in a few clicks." },
    { icon: ShieldCheck, title: "Secure onboarding", description: "Our PCI Level 1 compliant onboarding process verifies your church's data securely and swiftly." },
    { icon: LayoutDashboard, title: "Church giving dashboard", description: "Get direct access to your dedicated portal for complete transparency over every gift." },
    { icon: Landmark, title: "Payouts & deposits", description: "Track exactly when donations settle and land in your church's bank account." },
    { icon: Banknote, title: "Transparent pricing", description: "No hidden fees. A flat, stewardship-first rate so more of every gift stays in the ministry." },
  ],
  ctaHeadline: "Ready to grow giving?",
  ctaSubheadline: "Join the churches and ministries using our giving infrastructure to serve their congregations better.",
};

export default function ChurchesLandingPage() {
  return <AudienceLandingPage content={content} />;
}
