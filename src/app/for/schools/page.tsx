import type { Metadata } from "next";
import { GraduationCap, Repeat, ShieldCheck, LayoutDashboard, Users, Award } from "lucide-react";
import AudienceLandingPage, { type AudienceLandingContent } from "@/components/marketing/AudienceLandingPage";

export const metadata: Metadata = {
  title: "School Fundraising & Tuition Assistance Payment Software | WGC Payments",
  description: "Accept annual fund gifts, tuition assistance donations, and capital campaign pledges online. Payment processing built for private, religious, and nonprofit schools — with low-cost ACH and card processing.",
  openGraph: {
    title: "School Fundraising & Tuition Assistance Payment Software | WGC Payments",
    description: "Accept annual fund gifts, tuition assistance donations, and capital campaign pledges online — built for private, religious, and nonprofit schools.",
    url: "https://wgcpayments.com/for/schools",
  },
  alternates: { canonical: "/for/schools" },
};

const content: AudienceLandingContent = {
  eyebrow: "For Schools",
  headline: "Fundraising that fits",
  headlineAccent: "your school year",
  intro: "From the annual fund to tuition-assistance drives, capital campaigns, and class-specific fundraisers, WGC Payments gives your school a reliable way to collect gifts online — with low-cost ACH and card processing.",
  whoWeServeTitle: "Built for school communities",
  whoWeServe: [
    "Private and independent schools",
    "Christian and faith-based schools",
    "School foundations and booster clubs",
    "PTA/PTO fundraising committees",
    "Tuition assistance and scholarship funds",
    "Alumni giving and capital campaign offices",
  ],
  useCasesTitle: "Fundraising moments across the school year",
  useCasesSubtitle: "From back-to-school appeals to graduation, giving looks different at every point in the calendar.",
  useCases: [
    {
      title: "Annual fund campaign",
      description: "Run a year-round giving page tracking progress toward your annual fund goal, with recurring gift options for sustaining donors.",
    },
    {
      title: "Class-specific & booster fundraisers",
      description: "Give each grade, sports team, or club its own giving link so parents can support exactly the program their student is part of.",
    },
    {
      title: "Tuition assistance & scholarship drives",
      description: "Collect need-based tuition assistance gifts separately from general operating donations, with clear reporting for your finance office.",
    },
  ],
  featuresTitle: "Everything your school needs to raise more",
  featuresSubtitle: "A complete giving ecosystem built for school fundraising, without the overhead of legacy processors.",
  features: [
    { icon: GraduationCap, title: "Campaign giving links", description: "Create dedicated giving pages for the annual fund, capital campaigns, or class-specific drives." },
    { icon: Award, title: "Scholarship & tuition-assistance funds", description: "Track need-based giving separately from general school donations for clean reporting." },
    { icon: Repeat, title: "Recurring gifts", description: "Let parents and alumni set up recurring monthly support in a few clicks." },
    { icon: ShieldCheck, title: "Secure onboarding", description: "Our PCI Level 1 compliant onboarding process verifies your school's data securely and swiftly." },
    { icon: LayoutDashboard, title: "Fundraising dashboard", description: "Track every gift, donor, and campaign in one dedicated, transparent portal." },
    { icon: Users, title: "Donor-friendly checkout", description: "A fast, mobile-friendly giving experience parents and alumni actually complete." },
  ],
  faqTitle: "School fundraising, answered",
  faqs: [
    {
      question: "Can we run separate giving pages for the annual fund and a capital campaign at the same time?",
      answer: "Yes — each fund or campaign gets its own giving link, and your dashboard reports break totals down by campaign automatically.",
    },
    {
      question: "Can PTA/booster clubs run their own fundraisers under our school's account?",
      answer: "Yes, individual clubs and grade-level groups can have dedicated giving links tied back to your school's central account and reporting.",
    },
    {
      question: "Do you support recurring giving for alumni donors?",
      answer: "Yes — alumni and parent donors can set up recurring monthly or annual gifts in a few clicks, no account creation required.",
    },
    {
      question: "How does tuition assistance giving stay separate from general donations?",
      answer: "Create a dedicated giving link for the tuition assistance or scholarship fund so gifts are tracked and reported separately from your general operating fund.",
    },
  ],
  ctaHeadline: "Ready to raise more for your school?",
  ctaSubheadline: "Join the schools and foundations using our infrastructure to power their fundraising.",
};

export default function SchoolsLandingPage() {
  return <AudienceLandingPage content={content} />;
}
