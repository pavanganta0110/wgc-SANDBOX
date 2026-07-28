import type { Metadata } from "next";
import { Globe2, Repeat, ShieldCheck, LayoutDashboard, HeartHandshake, Plane } from "lucide-react";
import AudienceLandingPage, { type AudienceLandingContent } from "@/components/marketing/AudienceLandingPage";

export const metadata: Metadata = {
  title: "Donation Software for Missions Organizations & Christian Nonprofits",
  description: "Payment infrastructure for missions organizations, relief ministries, and Christian nonprofits — field-worker support, sponsorship-style giving, and international donor payments.",
  openGraph: {
    title: "Donation Software for Missions Organizations & Christian Nonprofits",
    description: "Field-worker support, sponsorship-style giving, and international donor payments for missions organizations and Christian nonprofits.",
    url: "https://wgcpayments.com/for/christian-nonprofits",
  },
  alternates: { canonical: "/for/christian-nonprofits" },
};

const content: AudienceLandingContent = {
  eyebrow: "For Christian Nonprofits & Missions",
  headline: "Fund the mission,",
  headlineAccent: "not the overhead",
  intro: "From field-worker support to disaster response and sponsorship programs, WGC Payments gives missions organizations and Christian nonprofits low-cost donation processing so more of every gift reaches the field.",
  whoWeServeTitle: "Built for mission-driven organizations",
  whoWeServe: [
    "International and domestic missions organizations",
    "Christian relief and humanitarian aid ministries",
    "Faith-based charities and 501(c)(3) ministries",
    "Discipleship, media, and outreach ministries",
    "Christian camps, conferences, and retreat centers",
    "Denominational agencies and mission boards",
  ],
  useCasesTitle: "Built for how missions organizations actually raise support",
  useCasesSubtitle: "Every gift is different — from a monthly missionary supporter to an emergency relief appeal.",
  useCases: [
    {
      title: "Monthly field-worker support",
      description: "Supporters commit to recurring monthly giving tied to a specific missionary or team, so field workers have predictable, sustained income.",
    },
    {
      title: "Sponsorship-style giving",
      description: "Run child-, family-, or project-sponsorship campaigns with dedicated giving pages that track sponsors against each sponsored recipient or project.",
    },
    {
      title: "Emergency relief appeals",
      description: "Spin up a disaster-response giving page in minutes and start collecting gifts immediately when time matters most.",
    },
  ],
  featuresTitle: "Everything your ministry needs to grow giving",
  featuresSubtitle: "A complete donation ecosystem designed for mission-driven organizations, without the overhead of legacy processors.",
  features: [
    { icon: Globe2, title: "Give from anywhere", description: "Accept card and ACH donations from supporters around the world through a secure giving page." },
    { icon: Plane, title: "Trip & team fundraising", description: "Give each missions trip or team its own giving link so supporters know exactly who and what they're funding." },
    { icon: Repeat, title: "Recurring giving", description: "Turn one-time donors into monthly partners with simple, flexible recurring giving." },
    { icon: ShieldCheck, title: "Secure onboarding", description: "PCI Level 1 compliant onboarding verifies your organization's data securely and swiftly." },
    { icon: LayoutDashboard, title: "Ministry dashboard", description: "Track every gift, donor, and campaign in one dedicated, transparent portal." },
    { icon: HeartHandshake, title: "Transparent pricing", description: "No hidden fees — a flat, mission-first rate so more of every gift reaches the field." },
  ],
  faqTitle: "Missions giving, answered",
  faqs: [
    {
      question: "Can supporters give to a specific missionary or field team?",
      answer: "Yes — create a dedicated giving link per missionary, team, or project so supporters and your finance team both know exactly where funds are going.",
    },
    {
      question: "Do you support international donors?",
      answer: "Yes, donors anywhere can give by card or bank transfer through your giving page; settlement into your organization's bank account follows standard processing.",
    },
    {
      question: "Can we run a sponsorship program through WGC?",
      answer: "Yes — sponsorship-style giving pages let you track recurring sponsors against specific recipients, families, or projects.",
    },
    {
      question: "How fast can we launch a giving page for a disaster relief appeal?",
      answer: "A new giving link can be live in minutes, so you can start collecting emergency relief gifts as soon as a need is identified.",
    },
  ],
  ctaHeadline: "Ready to expand your reach?",
  ctaSubheadline: "Join the Christian nonprofits and ministries using our infrastructure to fund their mission.",
};

export default function ChristianNonprofitsLandingPage() {
  return <AudienceLandingPage content={content} />;
}
