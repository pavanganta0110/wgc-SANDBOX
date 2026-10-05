import type { Metadata } from "next";
import { CreditCard, Repeat, ShieldCheck, LayoutDashboard, Landmark, Smartphone, Heart, FileText, BarChart3, Undo2, Users, Plug, Mail, MessageSquare } from "lucide-react";
import AudienceLandingPage, { type AudienceLandingContent } from "@/components/marketing/AudienceLandingPage";

export const metadata: Metadata = {
  title: "Giving & Church Management Platform | Donor Management, Tithing & Reporting",
  description: "More than online giving: donor management, recurring tithing, giving campaigns, invoicing, reporting, settlements, refunds, donor statements, team accounts with role-based permissions, and QuickBooks integration — all in one platform built for churches.",
  openGraph: {
    images: [{ url: "/og/verticals.png", width: 1200, height: 630 }],
    title: "Giving & Church Management Platform | Donor Management, Tithing & Reporting",
    description: "Donor management, recurring tithing, giving campaigns, invoicing, reporting, settlements, refunds, donor statements, and team accounts — all in one platform.",
    url: "https://www.wgcpayments.com/for/churches",
  },
  alternates: { canonical: "/for/churches" },
};

const content: AudienceLandingContent = {
  eyebrow: "For Churches",
  headline: "Save time. Save money.",
  headlineAccent: "Put more toward the mission.",
  intro: "WGC brings tithing, donor management, recurring giving, giving campaigns, invoicing, reporting, payouts, refunds, and staff access into one platform — so your church spends less time piecing together tools and more time on ministry.",
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
      description: "Launch a dedicated giving page for a specific campaign, email your congregation the link directly, and track progress toward the goal in real time.",
    },
  ],
  featuresTitle: "Everything your church needs — not just payments",
  featuresSubtitle: "A complete giving and operations platform, so your staff isn't jumping between a processor, a spreadsheet, and separate reporting tools.",
  features: [
    { icon: Heart, title: "Donor management", description: "A full donor record — giving history, contact info, and notes — for every member and guest who gives." },
    { icon: CreditCard, title: "Card and ACH giving", description: "Accept all major credit cards and low-cost ACH bank transfers directly from your congregation." },
    { icon: Repeat, title: "Recurring tithes & offerings", description: "Let members set up weekly, biweekly, or monthly recurring gifts in a few clicks." },
    { icon: Mail, title: "Email giving campaigns", description: "Send your giving link straight to a donor list by email for a fund drive or appeal, with per-donor tracking." },
    { icon: MessageSquare, title: "Text campaigns", description: "Send your giving link to a donor list by text message.", badge: "Coming Soon" },
    { icon: Smartphone, title: "Embeddable giving pages", description: "Drop a giving button or inline form directly into your church website or app — no redirect required." },
    { icon: FileText, title: "Invoicing", description: "Bill facility rentals, event fees, or school tuition and track payment status alongside your giving." },
    { icon: BarChart3, title: "Reporting & analytics", description: "Real-time dashboards on giving trends, fund balances, and donor retention." },
    { icon: Landmark, title: "Settlements & payouts", description: "Track exactly when donations settle and land in your church's bank account, fund by fund." },
    { icon: Undo2, title: "Refunds & disputes", description: "Issue a refund or respond to a dispute directly from your dashboard." },
    { icon: ShieldCheck, title: "Donor statements", description: "Auto-generated, tax-ready annual giving statements for every donor — no manual compiling each January." },
    { icon: Users, title: "Team accounts & permissions", description: "Give your pastor, finance team, and volunteers their own logins — Owner, Admin, Fundraiser, or Viewer access." },
    { icon: Plug, title: "QuickBooks integration", description: "Sync giving and transactions directly into QuickBooks, so your books stay current automatically." },
    { icon: LayoutDashboard, title: "Church giving dashboard", description: "Complete transparency over every gift, fund, and donor in one place." },
  ],
  teamSpotlightTitle: "Give your staff and volunteers the right access",
  teamSpotlightSubtitle: "Your pastor, finance staff, and volunteer fundraisers all need different levels of access. WGC gives each person their own login instead of one shared password floating around the church office.",
  teamRoles: [
    { role: "Owner", description: "Full control — billing, team management, and every feature." },
    { role: "Admin", description: "Runs day-to-day operations: giving, donors, reports, and settings." },
    { role: "Fundraiser", description: "Manages campaigns and donor outreach without access to sensitive settings." },
    { role: "Viewer", description: "Read-only access for elders, board members, or auditors who just need visibility." },
  ],
  faqTitle: "Church giving, answered",
  faqs: [
    {
      question: "Is this just a payment processor for online giving?",
      answer: "No. Alongside card and ACH giving, WGC includes donor management, recurring tithing, email giving campaigns, invoicing, reporting, settlements, refunds, donor statements, team accounts with role-based permissions, and QuickBooks integration — all in one dashboard.",
    },
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
      question: "Does WGC support different logins for staff and volunteers?",
      answer: "Yes — Owner, Admin, Fundraiser, and Viewer roles let you give each person access scoped to what they actually need, instead of everyone sharing one login.",
    },
    {
      question: "Can donors cover the processing fee so it doesn't cost our church anything?",
      answer: "Yes — when a donor chooses to cover the fee, the processing cost to your church is $0.",
    },
  ],
  ctaHeadline: "Ready to give your staff their time back?",
  ctaSubheadline: "Join the churches using WGC to run giving, donors, and operations from one place.",
};

export default function ChurchesLandingPage() {
  return <AudienceLandingPage content={content} />;
}
