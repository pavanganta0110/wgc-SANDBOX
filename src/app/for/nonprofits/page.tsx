import type { Metadata } from "next";
import { HeartHandshake, Repeat, ShieldCheck, LayoutDashboard, CalendarDays, Megaphone } from "lucide-react";
import AudienceLandingPage, { type AudienceLandingContent } from "@/components/marketing/AudienceLandingPage";

export const metadata: Metadata = {
  title: "Donation Processing for Nonprofits & 501(c) Organizations | WGC Payments",
  description: "Payment infrastructure for community charities, advocacy groups, and other 501(c) organizations — event ticketing, membership dues, matching-gift-ready donations, and a transparent dashboard.",
  openGraph: {
    title: "Donation Processing for Nonprofits & 501(c) Organizations | WGC Payments",
    description: "Event ticketing, membership dues, matching-gift-ready donations, and a transparent dashboard for nonprofits and other 501(c) organizations.",
    url: "https://wgcpayments.com/for/nonprofits",
  },
  alternates: { canonical: "/for/nonprofits" },
};

const content: AudienceLandingContent = {
  eyebrow: "For Nonprofits",
  headline: "Donations, memberships, and events —",
  headlineAccent: "one platform",
  intro: "From community charities to advocacy groups and foundations, WGC Payments gives nonprofits and other 501(c) organizations low-cost, reliable payment processing so more of every gift reaches the cause.",
  whoWeServeTitle: "Built for mission-driven organizations",
  whoWeServe: [
    "Community and social-service charities",
    "Advocacy and civic organizations",
    "Private and community foundations",
    "Arts, culture, and environmental nonprofits",
    "Health and human-services organizations",
    "Nonprofit software platforms embedding giving for customers",
  ],
  useCasesTitle: "Every way your organization brings in support",
  useCasesSubtitle: "Nonprofits rarely rely on just one kind of gift — your payment platform shouldn't either.",
  useCases: [
    {
      title: "General & designated donations",
      description: "Accept undesignated gifts to your general fund or route them to a specific program with dedicated giving links.",
    },
    {
      title: "Membership dues & sustaining gifts",
      description: "Collect recurring membership dues or sustaining-donor gifts on a schedule members set once and forget.",
    },
    {
      title: "Event & gala ticketing gifts",
      description: "Take ticket purchases and event-night giving through the same platform you already use for everyday donations.",
    },
  ],
  featuresTitle: "Everything your organization needs to grow giving",
  featuresSubtitle: "A complete donation ecosystem designed for nonprofits, without the overhead of legacy processors.",
  features: [
    { icon: HeartHandshake, title: "Card and ACH donations", description: "Accept all major credit cards and low-cost ACH bank transfers directly from your donors." },
    { icon: CalendarDays, title: "Event & campaign giving links", description: "Spin up dedicated giving links for specific programs, campaigns, galas, or year-end appeals." },
    { icon: Repeat, title: "Recurring giving & dues", description: "Turn one-time donors into sustaining members with simple, flexible recurring giving." },
    { icon: ShieldCheck, title: "Secure onboarding", description: "Our PCI Level 1 compliant onboarding process verifies your organization's data securely and swiftly." },
    { icon: LayoutDashboard, title: "Organization dashboard", description: "Track every gift, donor, and campaign in one dedicated, transparent portal." },
    { icon: Megaphone, title: "Advocacy-ready giving pages", description: "Launch time-sensitive appeal or advocacy campaigns fast, without waiting on a redesign." },
  ],
  faqTitle: "Nonprofit giving, answered",
  faqs: [
    {
      question: "Can donors give to a specific program instead of our general fund?",
      answer: "Yes — dedicated giving links let donors choose a specific program or campaign, and your reporting breaks totals down by designation automatically.",
    },
    {
      question: "Do you support recurring membership dues, not just donations?",
      answer: "Yes — recurring giving works for membership dues and sustaining-donor gifts on whatever schedule you set.",
    },
    {
      question: "Can we use this for event ticket sales, like a gala?",
      answer: "Yes — event and ticketing gifts run through the same giving-link system as your everyday donations, so everything is reported in one place.",
    },
    {
      question: "Is our organization's data verified before we can start accepting gifts?",
      answer: "Yes — every organization goes through PCI Level 1 compliant onboarding that verifies your data before your giving pages go live.",
    },
  ],
  ctaHeadline: "Ready to grow your impact?",
  ctaSubheadline: "Join the nonprofits and 501(c) organizations using our infrastructure to fund their mission.",
};

export default function NonprofitsLandingPage() {
  return <AudienceLandingPage content={content} />;
}
