import type { Metadata } from "next";
import { Landmark, Repeat, ShieldCheck, LayoutDashboard, Building2, Banknote } from "lucide-react";
import AudienceLandingPage, { type AudienceLandingContent } from "@/components/marketing/AudienceLandingPage";

export const metadata: Metadata = {
  title: "Donation Processing for Government & Public Sector Programs | WGC Payments",
  description: "Payment processing for public-sector foundations, community funds, and government-affiliated charitable programs. Low-cost ACH and card donations with a transparent dashboard.",
  openGraph: {
    title: "Donation Processing for Government & Public Sector Programs | WGC Payments",
    description: "Payment processing for public-sector foundations, community funds, and government-affiliated charitable programs.",
    url: "https://www.wgcpayments.com/for/government",
  },
  alternates: { canonical: "/for/government" },
};

const content: AudienceLandingContent = {
  eyebrow: "For Government & Public Sector",
  headline: "Giving infrastructure for",
  headlineAccent: "public programs",
  intro: "From park and library foundations to disaster-relief and community funds, WGC Payments helps government-affiliated charitable programs accept public donations online — with low-cost ACH and card processing.",
  whoWeServeTitle: "Built for public-sector giving programs",
  whoWeServe: [
    "Parks, recreation, and library foundations",
    "Fire and police charitable/benevolent funds",
    "Municipal and county community foundations",
    "Disaster relief and emergency response funds",
    "Public school district foundations",
    "Friends-of groups supporting public institutions",
  ],
  featuresTitle: "Everything your program needs to accept public giving",
  featuresSubtitle: "A complete donation ecosystem built for the accountability and transparency public programs require.",
  features: [
    { icon: Landmark, title: "Card and ACH giving", description: "Accept all major credit cards and low-cost ACH bank transfers from residents and supporters." },
    { icon: Repeat, title: "Recurring community support", description: "Let supporters set up recurring monthly or annual gifts to fund ongoing programs." },
    { icon: ShieldCheck, title: "Secure onboarding", description: "Our PCI Level 1 compliant onboarding process verifies your organization's data securely and swiftly." },
    { icon: LayoutDashboard, title: "Transparent dashboard", description: "Track every gift with the reporting clarity public-facing programs need." },
    { icon: Building2, title: "Campaign-ready giving links", description: "Spin up dedicated giving links for specific initiatives, funds, or emergency campaigns." },
    { icon: Banknote, title: "Transparent pricing", description: "No hidden fees — a flat, predictable rate that's easy to account for in public reporting." },
  ],
  ctaHeadline: "Ready to modernize public giving?",
  ctaSubheadline: "Join the public-sector programs and foundations using our infrastructure to fund their communities.",
};

export default function GovernmentLandingPage() {
  return <AudienceLandingPage content={content} />;
}
