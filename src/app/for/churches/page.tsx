import type { Metadata } from "next";
import { CreditCard, Repeat, ShieldCheck, LayoutDashboard, Landmark, Smartphone } from "lucide-react";
import AudienceLandingPage, { type AudienceLandingContent } from "@/components/marketing/AudienceLandingPage";

export const metadata: Metadata = {
  title: "Church Online Giving Software | Tithe, Offering & Building Fund Payments",
  description: "Take Sunday offerings, weekly tithes, and building-fund gifts online with low-cost ACH and card processing built for churches — text-to-give, recurring tithing, and a real-time giving dashboard.",
  openGraph: {
    images: [{ url: "/og/verticals.png", width: 1200, height: 630 }],
    title: "Church Online Giving Software | Tithe, Offering & Building Fund Payments",
    description: "Take Sunday offerings, weekly tithes, and building-fund gifts online — text-to-give, recurring tithing, and a real-time giving dashboard.",
    url: "https://www.wgcpayments.com/for/churches",
  },
  alternates: { canonical: "/for/churches" },
};

const content: AudienceLandingContent = {
  eyebrow: "For Churches",
  headline: "Tithing and offerings,",
  headlineAccent: "made simple",
  intro: "From Sunday morning offerings to building-fund campaigns, WGC Payments gives your church a giving platform members actually use — low-cost ACH, recurring tithing, and a dashboard your finance team can trust.",
  whoWeServeTitle: "Built for congregations of every size",
  whoWeServe: [
    "Single-campus and multi-site churches",
    "Church plants and rapidly growing congregations",
    "Denominational and network-affiliated churches",
    "Global faith networks with multiple giving locations",
    "Church management software (ChMS) platforms embedding giving",
    "Ministries running building funds and capital campaigns",
  ],
  useCasesTitle: "Real giving moments, covered",
  useCasesSubtitle: "Built around how congregations actually give — not retrofitted from generic checkout software.",
  useCases: [
    {
      title: "Sunday morning offering",
      description: "A donor scans a QR code or taps a giving-link button from their bulletin and gives in under 30 seconds — no app download required.",
    },
    {
      title: "Weekly recurring tithing",
      description: "Members set up automatic weekly or monthly tithes tied to payday, so giving never falls off during a busy season.",
    },
    {
      title: "Building fund & capital campaigns",
      description: "Launch a dedicated giving page for a specific campaign, track it separately from general offerings, and see progress toward the goal in real time.",
    },
  ],
  featuresTitle: "Everything your ministry needs",
  featuresSubtitle: "A complete giving ecosystem designed to facilitate generous giving without the headache of legacy processors.",
  features: [
    { icon: CreditCard, title: "Card and ACH giving", description: "Accept all major credit cards and low-cost ACH bank transfers directly from your congregation." },
    { icon: Repeat, title: "Recurring tithes & offerings", description: "Let members set up weekly, biweekly, or monthly recurring gifts in a few clicks." },
    { icon: Smartphone, title: "Text-to-give & embeddable giving", description: "Drop a giving button or inline form directly into your church website or app — no redirect required." },
    { icon: ShieldCheck, title: "Secure onboarding", description: "Our PCI Level 1 compliant onboarding process verifies your church's data securely and swiftly." },
    { icon: LayoutDashboard, title: "Church giving dashboard", description: "Get direct access to your dedicated portal for complete transparency over every gift, fund, and donor." },
    { icon: Landmark, title: "Payouts & deposits", description: "Track exactly when donations settle and land in your church's bank account, fund by fund." },
  ],
  faqTitle: "Church giving, answered",
  faqs: [
    {
      question: "Can donors set up recurring tithes without creating an account?",
      answer: "Yes. A donor enters their card or bank details once on your giving page and can choose a one-time or recurring gift — no login or app required.",
    },
    {
      question: "How quickly do offerings reach our church's bank account?",
      answer: "Deposits follow Finix's standard settlement schedule, and every deposit is itemized in your dashboard so your finance team can reconcile it against giving reports.",
    },
    {
      question: "Can we track giving separately by fund, like tithes vs. the building fund?",
      answer: "Yes. Create dedicated giving links per fund or campaign, and your dashboard reports break down totals by fund automatically.",
    },
    {
      question: "Do you support ACH giving, not just cards?",
      answer: "Yes — ACH bank transfers are supported at a lower cost than card processing, which matters most on large or recurring gifts.",
    },
  ],
  ctaHeadline: "Ready to grow giving?",
  ctaSubheadline: "Join the churches and ministries using our giving infrastructure to serve their congregations better.",
};

export default function ChurchesLandingPage() {
  return <AudienceLandingPage content={content} />;
}
