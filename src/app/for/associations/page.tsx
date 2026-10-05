import type { Metadata } from "next";
import { HandCoins, Repeat, FileText, Users, BarChart3, ShieldCheck } from "lucide-react";
import AudienceLandingPage, { type AudienceLandingContent } from "@/components/marketing/AudienceLandingPage";

export const metadata: Metadata = {
  title: "Payment & Membership Management Software for Associations | WGC Payments",
  description: "Membership dues, renewals, invoicing, and member records in one platform. Payment processing built for associations, membership organizations, and professional societies — with low-cost ACH and card processing.",
  openGraph: {
    images: [{ url: "/og/verticals.png", width: 1200, height: 630 }],
    title: "Payment & Membership Management Software for Associations | WGC Payments",
    description: "Membership dues, renewals, invoicing, and member records in one platform — built for associations and membership organizations.",
    url: "https://www.wgcpayments.com/for/associations",
  },
  alternates: { canonical: "/for/associations" },
};

const content: AudienceLandingContent = {
  eyebrow: "For Associations",
  headline: "Membership payments that",
  headlineAccent: "run themselves",
  intro: "WGC brings dues, renewals, invoicing, and member records into one platform — so your association spends less time chasing payments and more time serving members.",
  whoWeServeTitle: "Built for membership organizations",
  whoWeServe: [
    "Professional and trade associations",
    "Membership organizations and societies",
    "Chambers of commerce",
    "Alumni and fraternal associations",
    "Homeowners and neighborhood associations",
    "Advocacy and civic membership groups",
  ],
  useCasesTitle: "Membership moments across the year",
  useCasesSubtitle: "From onboarding a new member to renewal season, WGC handles the payment side automatically.",
  useCases: [
    {
      title: "Membership dues & renewals",
      description: "Collect one-time or recurring dues, billed automatically on the schedule you set, with clear payment history for every member.",
    },
    {
      title: "Event & conference invoicing",
      description: "Bill members for conferences, chapter events, or certification fees, and track who has and hasn't paid.",
    },
    {
      title: "Chapter & committee fundraising",
      description: "Give individual chapters or committees their own giving or payment link, rolled up into one central dashboard.",
    },
  ],
  featuresTitle: "Everything your association needs",
  featuresSubtitle: "A complete membership and payments platform, not just a dues collector.",
  features: [
    { icon: HandCoins, title: "Membership dues & renewals", description: "Collect one-time or recurring membership dues, billed on your schedule." },
    { icon: Repeat, title: "Recurring payments", description: "Turn annual dues into predictable recurring revenue, billed automatically." },
    { icon: FileText, title: "Invoicing", description: "Bill members for events, certifications, or special assessments and track payment status." },
    { icon: Users, title: "Member records", description: "A full member record — payment history, contact info, and notes in one place." },
    { icon: BarChart3, title: "Reporting", description: "Real-time dashboards on membership revenue and event income, exportable to CSV." },
    { icon: ShieldCheck, title: "Secure onboarding", description: "Our PCI Level 1 compliant onboarding process verifies your association's data securely and swiftly." },
  ],
  teamSpotlightTitle: "Your entire team. One association account.",
  teamSpotlightSubtitle: "Give staff and volunteer leadership their own logins, scoped to what they need.",
  teamRoles: [
    { role: "Owner", description: "Full control — billing, team management, and every feature." },
    { role: "Admin", description: "Runs day-to-day operations: dues, members, reports, and settings." },
    { role: "Fundraiser", description: "Manages event billing and member outreach without access to sensitive settings." },
    { role: "Viewer", description: "Read-only access for board members who just need visibility." },
  ],
  faqTitle: "Association payments, answered",
  faqs: [
    {
      question: "Can members set up automatic recurring dues?",
      answer: "Yes — members can set up recurring monthly or annual dues, and WGC bills them automatically on that schedule.",
    },
    {
      question: "Can we bill members for events separately from dues?",
      answer: "Yes, use invoicing to bill for conferences, certifications, or special assessments, tracked separately from recurring dues in your dashboard.",
    },
    {
      question: "Can our chapters or committees have their own payment links?",
      answer: "Yes — individual chapters or committees can have dedicated payment links tied back to your association's central account and reporting.",
    },
    {
      question: "Does WGC support ACH bank transfers, not just cards?",
      answer: "Yes, WGC accepts both card and low-cost ACH bank transfer payments from members.",
    },
  ],
  ctaHeadline: "Ready to simplify membership payments?",
  ctaSubheadline: "Join the associations using WGC to run dues, members, and operations from one place.",
};

export default function AssociationsLandingPage() {
  return <AudienceLandingPage content={content} />;
}
