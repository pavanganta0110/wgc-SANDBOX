import type { Metadata } from "next";
import { Globe2, Repeat, ShieldCheck, LayoutDashboard, HeartHandshake, Banknote } from "lucide-react";
import AudienceLandingPage, { type AudienceLandingContent } from "@/components/marketing/AudienceLandingPage";

export const metadata: Metadata = {
  title: "Donation Processing for Christian Nonprofits & Ministries | WGC Payments",
  description: "Payment infrastructure built for Christian nonprofits, missions organizations, and faith-based ministries. Low-cost ACH and card donations, recurring giving, and a dedicated dashboard.",
  openGraph: {
    title: "Donation Processing for Christian Nonprofits & Ministries | WGC Payments",
    description: "Payment infrastructure built for Christian nonprofits, missions organizations, and faith-based ministries.",
    url: "https://www.wgcpayments.com/for/christian-nonprofits",
  },
  alternates: { canonical: "/for/christian-nonprofits" },
};

const content: AudienceLandingContent = {
  eyebrow: "For Christian Nonprofits",
  headline: "Donation infrastructure for",
  headlineAccent: "faith-based ministries",
  intro: "From missions organizations to relief ministries and Christian charities, WGC Payments gives your nonprofit low-cost, reliable donation processing so more of every gift reaches the mission.",
  whoWeServeTitle: "Built for mission-driven organizations",
  whoWeServe: [
    "International and domestic missions organizations",
    "Christian relief and humanitarian aid ministries",
    "Faith-based charities and 501(c)(3) ministries",
    "Discipleship, media, and outreach ministries",
    "Christian camps, conferences, and retreat centers",
    "Denominational agencies and mission boards",
  ],
  featuresTitle: "Everything your ministry needs to grow giving",
  featuresSubtitle: "A complete donation ecosystem designed for mission-driven organizations, without the overhead of legacy processors.",
  features: [
    { icon: Globe2, title: "Give from anywhere", description: "Accept card and ACH donations from supporters around the world through a secure giving page." },
    { icon: Repeat, title: "Recurring giving", description: "Turn one-time donors into monthly partners with simple, flexible recurring giving." },
    { icon: ShieldCheck, title: "Secure onboarding", description: "PCI Level 1 compliant onboarding verifies your organization's data securely and swiftly." },
    { icon: LayoutDashboard, title: "Ministry dashboard", description: "Track every gift, donor, and campaign in one dedicated, transparent portal." },
    { icon: HeartHandshake, title: "Campaign-ready giving links", description: "Spin up dedicated giving links for specific campaigns, projects, or missions trips." },
    { icon: Banknote, title: "Transparent pricing", description: "No hidden fees — a flat, mission-first rate so more of every gift reaches the field." },
  ],
  ctaHeadline: "Ready to expand your reach?",
  ctaSubheadline: "Join the Christian nonprofits and ministries using our infrastructure to fund their mission.",
};

export default function ChristianNonprofitsLandingPage() {
  return <AudienceLandingPage content={content} />;
}
