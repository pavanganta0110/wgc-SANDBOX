import type { Metadata } from "next";
import Link from "next/link";
import {
  CreditCard, Heart, Repeat, Banknote, FileText, Users, BarChart3, Undo2, Plug, Code2, ArrowLeftRight,
  LineChart, LayoutTemplate, Webhook, QrCode, Trophy, Ticket, Radio, LucideIcon,
} from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import CTASection from "@/components/ui/CTASection";
import ScrollFade from "@/components/ui/ScrollFade";
import { pageGraph, breadcrumbs } from "@/lib/schema";

export const metadata: Metadata = {
  title: "Fundraising & Donor Management Features | WGC Payments",
  description: "Every feature in the WGC fundraising platform: payments, donor profiles and donation history, recurring giving, campaigns, invoicing, external/offline donations, donor analytics, team accounts, reporting, settlements, refunds, and integrations — all in one place.",
  openGraph: {
    images: [{ url: "/og/verticals.png", width: 1200, height: 630 }],
    title: "Fundraising & Donor Management Features | WGC Payments",
    description: "Every feature in the WGC fundraising platform, organized by category — payments, donors, giving, team accounts, reporting, and more.",
    url: "https://www.wgcpayments.com/features",
  },
  alternates: { canonical: "/features" },
};

interface FeatureCategory {
  title: string;
  description: string;
  items: { icon: LucideIcon; title: string; description: string; badge?: string }[];
}

const CATEGORIES: FeatureCategory[] = [
  {
    title: "Payments",
    description: "Accept every common way a supporter, donor, or member wants to pay.",
    items: [
      { icon: CreditCard, title: "Card payments", description: "Accept all major credit and debit cards." },
      { icon: Banknote, title: "ACH bank transfers", description: "Low-cost ACH payments, flat fee per transaction." },
      { icon: CreditCard, title: "Apple Pay & Google Pay", description: "Digital wallet checkout where available, for faster mobile giving." },
      { icon: Banknote, title: "One-time & recurring payments", description: "Single gifts, dues, or invoices — or automated recurring support." },
    ],
  },
  {
    title: "Supporters & Donors",
    description: "One record for every person who gives, pays dues, or supports your mission.",
    items: [
      { icon: Heart, title: "Donor profiles & donation history", description: "Full giving history, contact info, and notes in one CRM record." },
      { icon: Users, title: "Member & donor records", description: "Track individuals and organizations across every payment type." },
      { icon: ArrowLeftRight, title: "External & offline donations", description: "Record cash, check, or other gifts given outside WGC so they appear in donor history and reporting." },
      { icon: LineChart, title: "Donor analytics", description: "Lapsed-donor detection and top-donor tracking, beyond generic reporting." },
      { icon: FileText, title: "Year-end statements", description: "Auto-generated, tax-ready annual giving statements." },
    ],
  },
  {
    title: "Recurring Giving",
    description: "Turn one-time support into predictable, sustaining revenue.",
    items: [
      { icon: Repeat, title: "Automated recurring gifts", description: "Monthly or annual recurring payments, managed automatically." },
      { icon: Repeat, title: "Recurring dues & subscriptions", description: "Membership dues or subscription-style payments on autopilot." },
    ],
  },
  {
    title: "Campaigns & Giving Pages",
    description: "Launch a branded page or campaign in minutes, no developer required.",
    items: [
      { icon: Banknote, title: "Branded giving & campaign pages", description: "Custom-branded pages with your logo and colors." },
      { icon: Heart, title: "Email giving campaigns", description: "Send your giving link to a supporter list by email, with per-supporter tracking." },
      { icon: Heart, title: "Text campaigns", description: "Send your giving link by text message.", badge: "Coming Soon" },
    ],
  },
  {
    title: "Invoices",
    description: "Bill anything from pledges to dues to event fees.",
    items: [
      { icon: FileText, title: "Invoicing & payment requests", description: "Bill pledges, dues, tuition, or event fees and track payment status." },
    ],
  },
  {
    title: "Team & Permissions",
    description: "Your entire team, one organization account.",
    items: [
      { icon: Users, title: "Team accounts", description: "Give every staff member and volunteer their own login." },
      { icon: Users, title: "Role-based permissions", description: "Owner, Admin, Fundraiser, and Viewer roles, scoped to what each person needs." },
    ],
  },
  {
    title: "Reporting",
    description: "Real-time visibility into every dollar that moves through your organization.",
    items: [
      { icon: BarChart3, title: "Real-time dashboards", description: "Giving trends, retention, and campaign performance at a glance." },
      { icon: BarChart3, title: "CSV exports", description: "Export any report for your board, auditors, or accounting team." },
    ],
  },
  {
    title: "Settlements & Payouts",
    description: "Know exactly when funds hit your bank account.",
    items: [
      { icon: Banknote, title: "Settlements & payouts", description: "Itemized payouts to your bank account, transaction by transaction." },
    ],
  },
  {
    title: "Refunds",
    description: "Handle corrections and disputes without leaving your dashboard.",
    items: [
      { icon: Undo2, title: "Refunds & disputes", description: "Issue a refund or respond to a chargeback dispute directly from your dashboard." },
    ],
  },
  {
    title: "Integrations",
    description: "Connect WGC to the accounting and website tools you already use.",
    items: [
      { icon: Plug, title: "QuickBooks integration", description: "Sync giving and transactions directly into QuickBooks." },
      { icon: Plug, title: "Aplos integration", description: "Full fund-accounting sync built for nonprofits." },
      { icon: LayoutTemplate, title: "Embeddable giving forms", description: "Add a donate button or inline giving form to your own website." },
    ],
  },
  {
    title: "Software Partnerships",
    description: "For software platforms that want to embed WGC's payment infrastructure into their own product.",
    items: [
      { icon: Code2, title: "Guided platform integration", description: "Onboarding, payments, and recurring giving embedded into your platform today, through our team." },
      { icon: Webhook, title: "Webhooks", description: "Event notifications delivered to your own systems.", badge: "Coming Soon" },
      { icon: Code2, title: "Self-serve API access", description: "API keys software partners can use to build directly on WGC.", badge: "Coming Soon" },
    ],
  },
  {
    title: "Fundraising Tools",
    description: "Beyond basic giving — tools for campaigns that involve more than one giving page.",
    items: [
      { icon: QrCode, title: "Peer-to-peer fundraising", description: "Individual and team fundraiser pages under one campaign, each with its own link and progress." },
      { icon: Trophy, title: "Fundraiser & team leaderboards", description: "Rank individual fundraisers or teams by amount raised." },
      { icon: Heart, title: "Donor walls & social sharing", description: "Publicly recognize supporters and make it easy to share a campaign.", badge: "Coming Soon" },
      { icon: Radio, title: "Text-to-give & SMS donor engagement", description: "Give and receive updates by text message.", badge: "Coming Soon" },
      { icon: Ticket, title: "Event fundraising", description: "Attendees, tickets, capacity, and check-in for fundraising events.", badge: "Coming Soon" },
    ],
  },
];

const jsonLd = pageGraph(
  breadcrumbs([
    { name: "Home", path: "/" },
    { name: "Features", path: "/features" },
  ]),
  {
    "@type": "ItemList",
    name: "WGC Platform Features",
    itemListElement: CATEGORIES.map((cat, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: cat.title,
      description: cat.description,
    })),
  }
);

export default function FeaturesPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Header />
      <main className="flex-grow">
        {/* HERO */}
        <section className="relative pt-32 pb-20 md:pt-48 md:pb-24 overflow-hidden bg-wgc-navy-950">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
            <ScrollFade>
              <div className="inline-flex items-center gap-3 px-5 py-2 rounded-xl mb-8 border border-wgc-gold-500/20 bg-wgc-gold-500/5">
                <span className="text-[10px] font-black uppercase tracking-[0.4em] text-wgc-gold-500/90 font-mono">Everything WGC Provides</span>
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] mb-6 !text-white">
                One platform for payments, supporters, and financial operations
              </h1>
              <p className="text-lg sm:text-xl font-medium leading-relaxed text-white/70 max-w-2xl mx-auto tracking-tight">
                Every feature WGC provides, organized by category — so you can see exactly what&apos;s included before you switch.
              </p>
            </ScrollFade>
          </div>
        </section>

        {/* CATEGORIES */}
        <section className="py-24 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-20">
            {CATEGORIES.map((cat, ci) => (
              <ScrollFade key={cat.title} delay={ci * 40}>
                <div>
                  <div className="mb-8 max-w-2xl">
                    <h2 className="text-2xl md:text-3xl font-bold text-wgc-navy-950 tracking-tight mb-2">{cat.title}</h2>
                    <p className="text-wgc-navy-500 leading-relaxed">{cat.description}</p>
                  </div>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {cat.items.map((item) => (
                      <div key={item.title} className="p-6 bg-wgc-off rounded-2xl border border-wgc-navy-100 h-full flex flex-col">
                        <div className="w-10 h-10 rounded-xl bg-white border border-wgc-navy-100 flex items-center justify-center text-wgc-gold-500 mb-4">
                          <item.icon className="w-5 h-5" />
                        </div>
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <h3 className="text-[15px] font-bold text-wgc-navy-950 tracking-tight">{item.title}</h3>
                          {item.badge && (
                            <span className="px-2 py-0.5 rounded-full bg-white border border-wgc-navy-100 text-wgc-navy-400 text-[8px] font-black uppercase tracking-widest">
                              {item.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-[12px] font-medium text-wgc-navy-500 leading-relaxed">{item.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </ScrollFade>
            ))}
          </div>
        </section>

        {/* SOFTWARE PLATFORMS CALLOUT */}
        <section className="py-16 bg-wgc-off border-t border-wgc-navy-100">
          <div className="max-w-3xl mx-auto px-4 text-center space-y-4">
            <ScrollFade>
              <p className="text-wgc-navy-500 leading-relaxed">
                Building your own software and want to embed these features for the organizations you serve? See{" "}
                <Link href="/software-partners" className="text-wgc-gold-600 font-bold hover:underline">WGC for Software Platforms</Link>.
              </p>
              <p className="text-wgc-navy-500 leading-relaxed">
                Already using another fundraising or payment platform? See how to{" "}
                <Link href="/switch" className="text-wgc-gold-600 font-bold hover:underline">switch to WGC without starting over</Link>.
              </p>
            </ScrollFade>
          </div>
        </section>

        <CTASection
          headline="Ready to see it all in action?"
          subheadline="Join the mission-driven organizations using WGC to run payments, supporters, and operations from one place."
          ctaText="Get Started"
          ctaLink="/start"
        />
      </main>
      <Footer />
    </>
  );
}
