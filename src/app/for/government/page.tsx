import type { Metadata } from "next";
import { Landmark, Repeat, ShieldCheck, LayoutDashboard, Building2, FileCheck } from "lucide-react";
import AudienceLandingPage, { type AudienceLandingContent } from "@/components/marketing/AudienceLandingPage";

export const metadata: Metadata = {
  title: "Donation Processing for Government-Affiliated Foundations & Public Programs",
  description: "Payment processing for parks and library foundations, community funds, and other government-affiliated charitable programs — transparent reporting, low-cost ACH, and public-trust-ready accountability.",
  openGraph: {
    title: "Donation Processing for Government-Affiliated Foundations & Public Programs",
    description: "Transparent reporting, low-cost ACH, and public-trust-ready accountability for government-affiliated charitable programs.",
    url: "https://www.wgcpayments.com/for/government",
  },
  alternates: { canonical: "/for/government" },
};

const content: AudienceLandingContent = {
  eyebrow: "For Government & Public Sector",
  headline: "Public giving that",
  headlineAccent: "holds up to scrutiny",
  intro: "From park and library foundations to disaster-relief and community funds, WGC Payments helps government-affiliated charitable programs accept public donations online — with the transparent reporting public accountability requires.",
  whoWeServeTitle: "Built for public-sector giving programs",
  whoWeServe: [
    "Parks, recreation, and library foundations",
    "Fire and police charitable/benevolent funds",
    "Municipal and county community foundations",
    "Disaster relief and emergency response funds",
    "Public school district foundations",
    "Friends-of groups supporting public institutions",
  ],
  useCasesTitle: "Accountable giving for public programs",
  useCasesSubtitle: "Every dollar donated to a public program needs to be traceable, reportable, and easy to explain.",
  useCases: [
    {
      title: "Community disaster relief fund",
      description: "Stand up a dedicated giving page within minutes when a community emergency requires immediate, trackable public giving.",
    },
    {
      title: "Parks & library capital projects",
      description: "Collect gifts toward a specific facility or renovation, with a running total the public — and your board — can see reflected in reporting.",
    },
    {
      title: "First responder benevolent funds",
      description: "Accept recurring and one-time gifts to a fire or police charitable fund, kept separately reportable from general municipal accounts.",
    },
  ],
  featuresTitle: "Everything your program needs to accept public giving",
  featuresSubtitle: "A complete donation ecosystem built for the accountability and transparency public programs require.",
  features: [
    { icon: Landmark, title: "Card and ACH giving", description: "Accept all major credit cards and low-cost ACH bank transfers from residents and supporters." },
    { icon: FileCheck, title: "Reportable, itemized records", description: "Every gift is itemized and exportable — ready for board meetings, audits, or public records requests." },
    { icon: Repeat, title: "Recurring community support", description: "Let supporters set up recurring monthly or annual gifts to fund ongoing programs." },
    { icon: ShieldCheck, title: "Secure onboarding", description: "Our PCI Level 1 compliant onboarding process verifies your organization's data securely and swiftly." },
    { icon: LayoutDashboard, title: "Transparent dashboard", description: "Track every gift with the reporting clarity public-facing programs need." },
    { icon: Building2, title: "Campaign-ready giving links", description: "Spin up dedicated giving links for specific initiatives, funds, or emergency campaigns." },
  ],
  faqTitle: "Public-sector giving, answered",
  faqs: [
    {
      question: "Can our foundation keep donation records separate for public reporting or audits?",
      answer: "Yes — every gift is itemized in your dashboard and exportable, so records are ready for board meetings, financial audits, or public information requests.",
    },
    {
      question: "How quickly can we launch a giving page during an emergency?",
      answer: "A new giving link can be live in minutes, so your community fund can start accepting trackable donations as soon as a need is identified.",
    },
    {
      question: "Is this different from how we accept municipal fees or tax payments?",
      answer: "Yes — WGC Payments is built for voluntary charitable giving to affiliated foundations and community funds, not for tax or fee collection.",
    },
    {
      question: "Can multiple departments or funds share one account with separate reporting?",
      answer: "Yes — dedicated giving links per fund or initiative let each program's donations stay separately trackable within one organization account.",
    },
  ],
  ctaHeadline: "Ready to modernize public giving?",
  ctaSubheadline: "Join the public-sector programs and foundations using our infrastructure to fund their communities.",
};

export default function GovernmentLandingPage() {
  return <AudienceLandingPage content={content} />;
}
