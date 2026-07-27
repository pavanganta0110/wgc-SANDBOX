import type { Metadata } from "next";
import { GraduationCap, Repeat, ShieldCheck, LayoutDashboard, Users, Banknote } from "lucide-react";
import AudienceLandingPage, { type AudienceLandingContent } from "@/components/marketing/AudienceLandingPage";

export const metadata: Metadata = {
  title: "Donation & Fundraising Payments for Schools | WGC Payments",
  description: "Payment processing for private, religious, and nonprofit schools. Accept tuition assistance gifts, annual fund donations, and fundraising campaign payments with low-cost ACH and card processing.",
  openGraph: {
    title: "Donation & Fundraising Payments for Schools | WGC Payments",
    description: "Payment processing for private, religious, and nonprofit schools — tuition assistance gifts, annual funds, and fundraising campaigns.",
    url: "https://www.wgcpayments.com/for/schools",
  },
  alternates: { canonical: "/for/schools" },
};

const content: AudienceLandingContent = {
  eyebrow: "For Schools",
  headline: "Fundraising payments for",
  headlineAccent: "your school",
  intro: "From annual funds to tuition-assistance drives and capital campaigns, WGC Payments gives private, religious, and nonprofit schools a reliable way to collect gifts online — with low-cost ACH and card processing.",
  whoWeServeTitle: "Built for school communities",
  whoWeServe: [
    "Private and independent schools",
    "Christian and faith-based schools",
    "School foundations and booster clubs",
    "PTA/PTO fundraising committees",
    "Tuition assistance and scholarship funds",
    "Alumni giving and capital campaign offices",
  ],
  featuresTitle: "Everything your school needs to raise more",
  featuresSubtitle: "A complete giving ecosystem built for school fundraising, without the overhead of legacy processors.",
  features: [
    { icon: GraduationCap, title: "Campaign giving links", description: "Create dedicated giving pages for the annual fund, capital campaigns, or class-specific drives." },
    { icon: Repeat, title: "Recurring gifts", description: "Let parents and alumni set up recurring monthly support in a few clicks." },
    { icon: ShieldCheck, title: "Secure onboarding", description: "Our PCI Level 1 compliant onboarding process verifies your school's data securely and swiftly." },
    { icon: LayoutDashboard, title: "Fundraising dashboard", description: "Track every gift, donor, and campaign in one dedicated, transparent portal." },
    { icon: Users, title: "Donor-friendly checkout", description: "A fast, mobile-friendly giving experience parents and alumni actually complete." },
    { icon: Banknote, title: "Transparent pricing", description: "No hidden fees — a flat rate so more of every gift goes toward students, not processing costs." },
  ],
  ctaHeadline: "Ready to raise more for your school?",
  ctaSubheadline: "Join the schools and foundations using our infrastructure to power their fundraising.",
};

export default function SchoolsLandingPage() {
  return <AudienceLandingPage content={content} />;
}
