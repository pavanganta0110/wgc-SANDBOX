import type { Metadata } from "next";
import { Landmark, Repeat, BarChart3, FileText, Users, ShieldCheck } from "lucide-react";
import AudienceLandingPage, { type AudienceLandingContent } from "@/components/marketing/AudienceLandingPage";

export const metadata: Metadata = {
  title: "Giving & Grant Reporting Software for Foundations | WGC Payments",
  description: "Recurring giving, multi-fund tracking, and grant-ready reporting in one platform. Payment processing built for private and community foundations — with low-cost ACH and card processing.",
  openGraph: {
    images: [{ url: "/og/verticals.png", width: 1200, height: 630 }],
    title: "Giving & Grant Reporting Software for Foundations | WGC Payments",
    description: "Recurring giving, multi-fund tracking, and grant-ready reporting in one platform — built for foundations.",
    url: "https://www.wgcpayments.com/for/foundations",
  },
  alternates: { canonical: "/for/foundations" },
};

const content: AudienceLandingContent = {
  eyebrow: "For Foundations",
  headline: "Giving and reporting,",
  headlineAccent: "built for foundations",
  intro: "WGC brings donor management, recurring giving, multi-fund tracking, and grant-ready reporting into one platform — so your foundation spends less time on administration and more time on grantmaking and impact.",
  whoWeServeTitle: "Built for foundations of every kind",
  whoWeServe: [
    "Private and family foundations",
    "Community foundations",
    "Corporate giving foundations",
    "Endowment and legacy funds",
    "Scholarship and grant-making foundations",
    "Donor-advised fund sponsors",
  ],
  useCasesTitle: "Foundation giving moments",
  useCasesSubtitle: "From a single restricted fund to a multi-fund endowment, WGC keeps every dollar tracked and reportable.",
  useCases: [
    {
      title: "Multi-fund tracking",
      description: "Track gifts and disbursements across multiple funds or initiatives separately, with clean reporting for each.",
    },
    {
      title: "Recurring and legacy giving",
      description: "Let sustaining donors set up recurring gifts, and track major or legacy commitments alongside one-time contributions.",
    },
    {
      title: "Grant-ready financial reporting",
      description: "Generate reconciliation-ready reports and year-end statements your board and auditors can rely on.",
    },
  ],
  featuresTitle: "Everything your foundation needs",
  featuresSubtitle: "A complete giving and reporting platform, not just a donation form.",
  features: [
    { icon: Landmark, title: "Multi-fund tracking", description: "Track giving and disbursements across multiple funds or initiatives in one dashboard." },
    { icon: Repeat, title: "Recurring giving", description: "Turn one-time gifts into sustaining monthly or annual support automatically." },
    { icon: BarChart3, title: "Grant-ready reporting", description: "Real-time dashboards and reconciliation-ready exports for your board and auditors." },
    { icon: FileText, title: "Year-end statements", description: "Auto-generated, tax-ready annual giving statements for every donor." },
    { icon: Users, title: "Team accounts & roles", description: "Owner, Admin, Fundraiser, and Viewer access, scoped to what each staff member or board member needs." },
    { icon: ShieldCheck, title: "Secure onboarding", description: "Our PCI Level 1 compliant onboarding process verifies your foundation's data securely and swiftly." },
  ],
  teamSpotlightTitle: "Your entire team. One foundation account.",
  teamSpotlightSubtitle: "Give staff, trustees, and board members their own logins, scoped to what they need.",
  teamRoles: [
    { role: "Owner", description: "Full control — billing, team management, and every feature." },
    { role: "Admin", description: "Runs day-to-day operations: giving, funds, reports, and settings." },
    { role: "Fundraiser", description: "Manages donor outreach and campaigns without access to sensitive settings." },
    { role: "Viewer", description: "Read-only access for trustees or board members who just need visibility." },
  ],
  faqTitle: "Foundation giving, answered",
  faqs: [
    {
      question: "Can we track giving across multiple funds separately?",
      answer: "Yes — each fund or initiative can be tracked separately, with its own reporting rolled up into your central dashboard.",
    },
    {
      question: "Does WGC support recurring and legacy giving?",
      answer: "Yes, donors can set up recurring monthly or annual gifts, and larger or legacy commitments can be tracked alongside one-time contributions.",
    },
    {
      question: "Can our board access reports without full account access?",
      answer: "Yes — give board members or trustees Viewer access so they can see reporting without being able to change settings or process transactions.",
    },
    {
      question: "Are the reports suitable for our auditors?",
      answer: "Yes, WGC generates reconciliation-ready reports and exports designed to support your annual audit and grant reporting requirements.",
    },
  ],
  ctaHeadline: "Ready to simplify foundation giving and reporting?",
  ctaSubheadline: "Join the foundations using WGC to run giving, funds, and operations from one place.",
};

export default function FoundationsLandingPage() {
  return <AudienceLandingPage content={content} />;
}
