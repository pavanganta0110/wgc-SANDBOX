import type { Metadata } from "next";
import { Globe2, Repeat, ShieldCheck, LayoutDashboard, Plane, CalendarDays, Heart, FileText, BarChart3, Undo2, Users, Plug, Mail, MessageSquare } from "lucide-react";
import AudienceLandingPage, { type AudienceLandingContent } from "@/components/marketing/AudienceLandingPage";

export const metadata: Metadata = {
  title: "Giving & Donor Management Platform for Nonprofits",
  description: "More than donation processing: donor management, recurring giving, giving campaigns, invoicing, reporting, settlements, refunds, donor statements, team accounts with role-based permissions, and QuickBooks integration — all in one platform for nonprofits and ministries.",
  openGraph: {
    images: [{ url: "/og/verticals.png", width: 1200, height: 630 }],
    title: "Giving & Donor Management Platform for Nonprofits",
    description: "Donor management, recurring giving, giving campaigns, invoicing, reporting, settlements, refunds, donor statements, and team accounts — all in one platform.",
    url: "https://www.wgcpayments.com/for/christian-nonprofits",
  },
  alternates: { canonical: "/for/christian-nonprofits" },
};

const content: AudienceLandingContent = {
  eyebrow: "For Nonprofits & Ministries",
  headline: "Save time. Save money.",
  headlineAccent: "Put more toward the mission.",
  intro: "Whether you're a nonprofit, a missions organization, a community charity, or any other 501(c) organization, WGC brings donor management, recurring giving, campaigns, invoicing, reporting, payouts, refunds, and staff access into one platform — so more of your time and every gift goes toward the cause.",
  whoWeServeTitle: "Built for nonprofits, ministries, and mission-driven organizations",
  whoWeServe: [],
  whoWeServeCategories: [
    {
      title: "Ministries & Faith-Based Organizations",
      items: [
        "Parachurch and affiliated ministries",
        "Worship, media, and creative arts ministries",
        "Faith-based nonprofits and outreach programs",
      ],
    },
    {
      title: "Charities & Community Organizations",
      items: [
        "Community and social-service charities",
        "Advocacy and civic organizations",
        "Arts, culture, and environmental nonprofits",
        "Health and human-services organizations",
      ],
    },
    {
      title: "Other Nonprofits",
      items: [
        "Private and community foundations",
        "Membership associations and sustaining-donor programs",
        "Nonprofit software platforms embedding giving for customers",
      ],
    },
  ],
  useCasesTitle: "Built for how nonprofits and ministries actually raise support",
  useCasesSubtitle: "Every organization raises support differently — from a monthly missionary supporter to a gala ticket sale.",
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
    {
      title: "Emergency relief appeals",
      description: "Spin up a disaster-response giving page in minutes, email it to your supporter list, and start collecting gifts immediately when time matters most.",
    },
  ],
  featuresTitle: "Everything your organization needs — not just donation processing",
  featuresSubtitle: "A complete giving and operations platform for nonprofits and ministries, so your team isn't jumping between a processor, a spreadsheet, and separate reporting tools.",
  features: [
    { icon: Heart, title: "Donor management", description: "A full donor record — giving history, contact info, and notes — for every supporter and sponsor." },
    { icon: Globe2, title: "Give from anywhere", description: "Accept card and ACH donations from supporters and donors around the world through a secure giving page." },
    { icon: Repeat, title: "Recurring giving & dues", description: "Turn one-time donors into monthly partners or sustaining members with simple, flexible recurring giving." },
    { icon: Mail, title: "Email giving campaigns", description: "Send your giving link straight to a supporter list for an appeal or emergency response, with per-donor tracking." },
    { icon: MessageSquare, title: "Text campaigns", description: "Send your giving link to a supporter list by text message.", badge: "Coming Soon" },
    { icon: Plane, title: "Trip & team fundraising", description: "Give each missions trip or team its own giving link so supporters know exactly who and what they're funding." },
    { icon: CalendarDays, title: "Event & campaign giving links", description: "Spin up dedicated giving links for specific programs, campaigns, galas, or year-end appeals." },
    { icon: FileText, title: "Invoicing", description: "Bill membership dues, event fees, or program costs and track payment status alongside your giving." },
    { icon: BarChart3, title: "Reporting & analytics", description: "Real-time dashboards on giving trends, supporter retention, and campaign performance." },
    { icon: Undo2, title: "Refunds & disputes", description: "Issue a refund or respond to a dispute directly from your dashboard." },
    { icon: ShieldCheck, title: "Donor statements", description: "Auto-generated, tax-ready annual giving statements for every donor — no manual compiling." },
    { icon: Users, title: "Team accounts & permissions", description: "Give staff and volunteers their own logins — Owner, Admin, Fundraiser, or Viewer access." },
    { icon: Plug, title: "QuickBooks integration", description: "Sync giving and transactions directly into QuickBooks, so your books stay current automatically." },
    { icon: LayoutDashboard, title: "Organization dashboard", description: "Track every gift, donor, and campaign in one dedicated, transparent portal." },
  ],
  teamSpotlightTitle: "Give your team the right access",
  teamSpotlightSubtitle: "Executive directors, finance staff, and volunteer fundraisers all need different levels of access. WGC gives each person their own login instead of one shared password everyone knows.",
  teamRoles: [
    { role: "Owner", description: "Full control — billing, team management, and every feature." },
    { role: "Admin", description: "Runs day-to-day operations: giving, donors, reports, and settings." },
    { role: "Fundraiser", description: "Manages campaigns and donor outreach without access to sensitive settings." },
    { role: "Viewer", description: "Read-only access for board members or auditors who just need visibility." },
  ],
  faqTitle: "Nonprofit and ministry giving, answered",
  faqs: [
    {
      question: "Is this just a donation processor?",
      answer: "No. Alongside card and ACH donations, WGC includes donor management, recurring giving, email giving campaigns, invoicing, reporting, settlements, refunds, donor statements, team accounts with role-based permissions, and QuickBooks integration — all in one dashboard.",
    },
    {
      question: "Can supporters give to a specific missionary, program, or project?",
      answer: "Yes — create a dedicated giving link per missionary, team, program, or project so supporters and your finance team both know exactly where funds are going.",
    },
    {
      question: "Do you support recurring membership dues and monthly giving?",
      answer: "Yes — recurring giving works for monthly missionary support, membership dues, and sustaining-donor gifts on whatever schedule you set.",
    },
    {
      question: "Can we use this for event ticket sales or a sponsorship program?",
      answer: "Yes — event and ticketing gifts, and sponsorship-style giving pages, run through the same giving-link system as your everyday donations, so everything is reported in one place.",
    },
    {
      question: "Does WGC support different logins for staff and volunteers?",
      answer: "Yes — Owner, Admin, Fundraiser, and Viewer roles let you give each person access scoped to what they actually need, instead of everyone sharing one login.",
    },
    {
      question: "Do you support international donors?",
      answer: "Yes, donors anywhere can give by card or bank transfer through your giving page; settlement into your organization's bank account follows standard processing.",
    },
    {
      question: "How fast can we launch a giving page for a new campaign or emergency appeal?",
      answer: "A new giving link can be live in minutes, and you can email it directly to your supporter list, so you can start collecting gifts as soon as a campaign or need is identified.",
    },
  ],
  ctaHeadline: "Ready to give your team their time back?",
  ctaSubheadline: "Join the nonprofits and ministries using WGC to run giving, donors, and operations from one place.",
};

export default function NonprofitsLandingPage() {
  return <AudienceLandingPage content={content} />;
}
