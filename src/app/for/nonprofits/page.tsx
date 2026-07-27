import type { Metadata } from "next";
import { HeartHandshake, Repeat, ShieldCheck, LayoutDashboard, Users, Banknote } from "lucide-react";
import AudienceLandingPage, { type AudienceLandingContent } from "@/components/marketing/AudienceLandingPage";

export const metadata: Metadata = {
  title: "Donation Processing for Nonprofits & 501(c) Organizations | WGC Payments",
  description: "Payment infrastructure built for nonprofits and other 501(c) organizations. Low-cost ACH and card donations, recurring giving, and a transparent dashboard for every gift.",
  openGraph: {
    title: "Donation Processing for Nonprofits & 501(c) Organizations | WGC Payments",
    description: "Payment infrastructure built for nonprofits and other 501(c) organizations.",
    url: "https://www.wgcpayments.com/for/nonprofits",
  },
  alternates: { canonical: "/for/nonprofits" },
};

const content: AudienceLandingContent = {
  eyebrow: "For Nonprofits",
  headline: "Donation infrastructure for",
  headlineAccent: "every nonprofit",
  intro: "From community charities to advocacy groups and foundations, WGC Payments gives nonprofits and other 501(c) organizations low-cost, reliable donation processing so more of every gift reaches the cause.",
  whoWeServeTitle: "Built for mission-driven organizations",
  whoWeServe: [
    "Community and social-service charities",
    "Advocacy and civic organizations",
    "Private and community foundations",
    "Arts, culture, and environmental nonprofits",
    "Health and human-services organizations",
    "Nonprofit software platforms embedding giving for customers",
  ],
  featuresTitle: "Everything your organization needs to grow giving",
  featuresSubtitle: "A complete donation ecosystem designed for nonprofits, without the overhead of legacy processors.",
  features: [
    { icon: HeartHandshake, title: "Card and ACH donations", description: "Accept all major credit cards and low-cost ACH bank transfers directly from your donors." },
    { icon: Repeat, title: "Recurring giving", description: "Turn one-time donors into sustaining members with simple, flexible recurring giving." },
    { icon: ShieldCheck, title: "Secure onboarding", description: "Our PCI Level 1 compliant onboarding process verifies your organization's data securely and swiftly." },
    { icon: LayoutDashboard, title: "Organization dashboard", description: "Track every gift, donor, and campaign in one dedicated, transparent portal." },
    { icon: Users, title: "Campaign-ready giving links", description: "Spin up dedicated giving links for specific programs, campaigns, or events." },
    { icon: Banknote, title: "Transparent pricing", description: "No hidden fees — a flat rate so more of every gift goes toward your mission." },
  ],
  ctaHeadline: "Ready to grow your impact?",
  ctaSubheadline: "Join the nonprofits and 501(c) organizations using our infrastructure to fund their mission.",
};

export default function NonprofitsLandingPage() {
  return <AudienceLandingPage content={content} />;
}
