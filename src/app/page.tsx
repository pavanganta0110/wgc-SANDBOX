import Link from "next/link";
import Image from "next/image";
import { ShieldCheck, Users, BarChart3, Repeat, Heart, FileText, Banknote, Undo2, ClipboardList, Plug, Mail, MessageSquare, CreditCard, Landmark, Building2, GraduationCap, HandCoins, Building, Code2, ArrowLeftRight, QrCode, LucideIcon } from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import FeatureCard from "@/components/ui/FeatureCard";
import CTASection from "@/components/ui/CTASection";
import ScrollFade from "@/components/ui/ScrollFade";

import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const IMPACT_ITEMS = [
  {
    icon: Heart,
    title: "Donor & giving management",
    description: "See every donor, every gift, and every campaign in one place — no more spreadsheets alongside your processor.",
  },
  {
    icon: Users,
    title: "Team accounts & permissions",
    description: "Give staff and volunteers their own logins with Owner, Admin, Fundraiser, or Viewer access — never share one password again.",
  },
  {
    icon: ClipboardList,
    title: "Automated reporting & statements",
    description: "Year-end donor statements, transaction reports, and reconciliation-ready exports generate themselves.",
  },
  {
    icon: ShieldCheck,
    title: "Bank-level security",
    description: "PCI Level 1 compliance and encrypted data handling, so your organization's and donors' information stays protected.",
  },
];

const PLATFORM_FEATURES = [
  { icon: CreditCard, title: "Cards, ACH & Digital Wallets", description: "Accept one-time and recurring payments by card, ACH bank transfer, and Apple Pay / Google Pay where available." },
  { icon: Heart, title: "Donor & Supporter Profiles", description: "A full donor CRM — giving history, donation history, contact info, and notes in one record." },
  { icon: Repeat, title: "Recurring Giving", description: "Turn one-time gifts or dues into sustaining recurring support automatically." },
  { icon: Banknote, title: "Giving & Campaign Pages", description: "Launch a branded giving or campaign page in minutes, no developer required." },
  { icon: Mail, title: "Email Giving Campaigns", description: "Send your giving link straight to a supporter list by email, with per-supporter tracking." },
  { icon: MessageSquare, title: "Text-to-Give & Text Campaigns", description: "Send your giving link to a supporter list by text message.", badge: "Coming Soon" },
  { icon: QrCode, title: "Peer-to-Peer Fundraising", description: "Individual and team fundraiser pages under one campaign, each with its own link and progress." },
  { icon: FileText, title: "Invoicing & Payment Requests", description: "Bill pledges, dues, tuition, or event fees and track payment status." },
  { icon: ArrowLeftRight, title: "External & Offline Donations", description: "Record cash, check, or other gifts given outside WGC so they appear in donor history and reporting too." },
  { icon: BarChart3, title: "Reporting & Donor Analytics", description: "Real-time dashboards, lapsed-donor detection, and top-donor tracking, exportable to CSV." },
  { icon: Banknote, title: "Settlements & Payouts", description: "Know exactly when funds hit your bank account, itemized to the transaction." },
  { icon: Undo2, title: "Refunds & Disputes", description: "Issue a refund or respond to a dispute directly from your dashboard." },
  { icon: ClipboardList, title: "Year-End Statements", description: "Auto-generated, tax-ready annual giving statements — no manual compiling." },
  { icon: Users, title: "Team Accounts & Roles", description: "Owner, Admin, Fundraiser, and Viewer access, scoped to what each person needs." },
  { icon: Plug, title: "Accounting Integrations", description: "Sync giving and transactions directly into QuickBooks or Aplos." },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Product",
      "name": "WGC Fundraising, Payments & Donor Management Platform",
      "description": "WGC helps mission-driven organizations keep more of the money they raise and gives their teams time back by bringing payments, supporters, reporting, and financial operations into one platform. A fundraising, payments, and donor management platform for nonprofits, churches and ministries, foundations, associations, schools, and community organizations — with donor profiles, donation history, recurring giving, campaigns, invoicing, external/offline donation recording, reporting and donor analytics, settlements, refunds, year-end statements, team accounts with role-based permissions, and accounting integrations (QuickBooks, Aplos). WGC also partners with software platforms to embed this infrastructure into their own product.",
      "brand": { "@type": "Brand", "name": "WGC" },
      "offers": {
        "@type": "Offer",
        "priceCurrency": "USD",
        "price": "10.00",
        "priceSpecification": {
          "@type": "UnitPriceSpecification",
          "price": "10.00",
          "priceCurrency": "USD",
          "unitText": "per organization per month — the WGC platform fee, includes the full dashboard and all platform features"
        },
        "availability": "https://schema.org/InStock",
        "url": "https://www.wgcpayments.com/pricing",
        "seller": { "@id": "https://www.wgcpayments.com/#organization" }
      }
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Is WGC just a payment processor?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No. WGC is a fundraising, payments, and donor management platform for mission-driven organizations, not just a payment processor. Beyond accepting card, ACH, and digital wallet payments, WGC includes donor profiles and donation history, recurring giving, giving and campaign pages, invoicing, external and offline donation recording, reporting and donor analytics with CSV exports, settlements and payouts, refunds, year-end statements, team accounts with role-based permissions (Owner, Admin, Fundraiser, Viewer), and accounting integrations with QuickBooks and Aplos — all in one dashboard, instead of piecing together separate tools."
          }
        },
        {
          "@type": "Question",
          "name": "Can I switch to WGC from Givebutter, Zeffy, Donorbox, Stripe, or another platform?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes. WGC helps organizations migrate donor and contact records, historical and external donation data, funds, and organization information from another fundraising or payment platform, including CSV imports and spreadsheet-based donor databases. Saved card or bank details generally can't be transferred automatically between processors — recurring giving is reviewed during migration, and we help determine the best path based on your current provider."
          }
        },
        {
          "@type": "Question",
          "name": "How much does WGC cost for a nonprofit, church, or other organization?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "When a supporter chooses to cover the processing fee, the cost to the organization is $0. Organizations that choose to absorb the fee pay a maximum of 2.3% + 25¢ per card transaction and a flat 25¢ per ACH transaction. Every organization also pays a simple $10/month WGC platform fee, which includes full access to the dashboard and every platform feature — not just payment processing."
          }
        },
        {
          "@type": "Question",
          "name": "Does WGC support team accounts and staff permissions?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes. WGC supports Owner, Admin, Fundraiser, and Viewer roles so any organization can give each staff member or volunteer their own login with access scoped to what they actually need, instead of sharing one account and password."
          }
        },
        {
          "@type": "Question",
          "name": "What's the best alternative to Omella, Tithe.ly, Givebutter, or Zeffy?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "WGC is built for nonprofits, churches, foundations, associations, schools, and other mission-driven organizations that want more than a giving page — it combines supporter management, recurring giving, campaigns, invoicing, reporting, settlements, refunds, year-end statements, team accounts with role-based permissions, and accounting integrations in one platform, with a $0 processing cost option when supporters cover the fee."
          }
        }
      ]
    }
  ]
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Header />
      <main className="flex-grow">
        {/* HERO SECTION */}
        <section className="relative bg-wgc-navy-950 overflow-hidden min-h-[90vh] flex items-center">
          {/* Subtle grid pattern */}
          <div className="absolute inset-0 opacity-[0.05] pointer-events-none">
            <svg className="w-full h-full" fill="none" stroke="currentColor">
              <pattern id="home-grid" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" strokeWidth="1" className="text-wgc-navy-300" />
              </pattern>
              <rect width="100%" height="100%" fill="url(#home-grid)" />
            </svg>
          </div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <div className="grid lg:grid-cols-12 gap-12 lg:gap-20 items-center">
              <ScrollFade className="lg:col-span-7">
                <div className="inline-flex items-center gap-3 px-5 py-2 rounded-xl mb-10 border border-wgc-gold-500/20 bg-wgc-gold-500/5 backdrop-blur-sm">
                  <div className="w-2 h-2 rounded-full bg-wgc-gold-500 animate-pulse"></div>
                  <span className="text-[10px] font-black uppercase tracking-[0.4em] text-wgc-gold-500/90 font-mono">Fundraising, Payments & Donor Management</span>
                </div>
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] mb-8 !text-white">
                  Save money. Save staff time. <span className="text-wgc-gold-500 italic">Put more toward the mission.</span>
                </h1>
                <p className="text-lg sm:text-xl font-medium leading-relaxed mb-6 text-white/70 max-w-2xl tracking-tight">
                  WGC is a fundraising, payments, and donor management platform built for nonprofits, churches, foundations, associations, schools, and other mission-driven organizations.
                </p>
                <p className="text-lg sm:text-xl font-medium leading-relaxed mb-12 text-white/70 max-w-2xl tracking-tight">
                  Accept donations, track donor giving history, launch campaigns, automate recurring giving, send invoices, track every gift, and manage your organization — all from one dashboard.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 max-w-lg">
                  <Link href="/start" className="bg-wgc-gold-500 text-wgc-navy-950 inline-flex items-center justify-center px-8 py-4 text-[13px] font-bold rounded-2xl shadow-[0_20px_40px_rgba(234,179,8,0.2)] transform transition-all hover:scale-105 hover:bg-white uppercase tracking-widest w-full sm:w-auto">
                    Get Started
                  </Link>
                  <a href="https://calendly.com/collinsansom/1-on-1-wgc-first-look" target="_blank" rel="noopener noreferrer" className="bg-white/10 text-white inline-flex items-center justify-center px-8 py-4 text-[13px] font-bold rounded-2xl border border-white/20 transition-all hover:bg-white hover:text-wgc-navy-950 uppercase tracking-widest w-full sm:w-auto">
                    Book Live Demo
                  </a>
                </div>
              </ScrollFade>

              {/* RIGHT: Platform Gallery Frame */}
              <ScrollFade delay={200} className="lg:col-span-5">
                <div className="relative group">
                  <div className="relative rounded-[3rem] overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.4)] border border-white/10 aspect-[4/5] lg:aspect-auto lg:h-[600px]">
                    <Image
                      src="/images/church.webp"
                      alt="Mission-driven organization team using the WGC giving and payments platform"
                      fill
                      sizes="(max-width: 1024px) 100vw, 45vw"
                      priority
                      className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105 brightness-[1.02]"
                    />

                    {/* Top Right: Metric Badge */}
                    <div className="absolute top-8 right-8 bg-white p-5 rounded-2xl shadow-2xl border border-wgc-navy-100 z-20 animate-float">
                      <div className="text-[9px] font-black text-wgc-gold-600 uppercase tracking-widest mb-1 font-mono">Processing Cost</div>
                      <div className="text-xl font-bold text-wgc-navy-950">$0 to your org*</div>
                    </div>

                    {/* Bottom: Solid Quote Bar */}
                    <div className="absolute bottom-0 left-0 right-0 bg-wgc-navy-950/90 backdrop-blur-md p-10 border-t border-white/10">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-8 h-px bg-wgc-gold-500"></div>
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-wgc-gold-500 font-mono">One Platform</span>
                      </div>
                      <p className="text-lg sm:text-xl font-bold leading-snug text-white tracking-tight">
                        Donors, giving, reports, payouts, and your whole team — in one dashboard.
                      </p>
                      <p className="mt-3 text-[10px] uppercase tracking-widest text-white/50 font-mono">*When the donor covers the processing fee</p>
                    </div>
                  </div>
                </div>
              </ScrollFade>
            </div>
          </div>
        </section>

        {/* PROOF STRIP */}
        <section className="bg-wgc-navy-950 border-y border-white/5 py-12 overflow-hidden relative">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex flex-wrap justify-center gap-10 md:gap-20 text-[10px] font-bold uppercase tracking-[0.25em] text-wgc-navy-200 font-mono">
              <div className="flex items-center gap-3 group">
                <Heart className="w-5 h-5 text-wgc-gold-500 opacity-90" />
                Supporter Management
              </div>
              <div className="flex items-center gap-3 group">
                <Repeat className="w-5 h-5 text-wgc-gold-500 opacity-90" />
                Recurring Giving
              </div>
              <div className="flex items-center gap-3 group">
                <Users className="w-5 h-5 text-wgc-gold-500 opacity-90" />
                Team Roles & Permissions
              </div>
              <div className="flex items-center gap-3 group">
                <ShieldCheck className="w-5 h-5 text-wgc-gold-500 opacity-90" />
                Bank-Level Security
              </div>
            </div>
          </div>
        </section>

        {/* $0 ORGANIZATION PROCESSING COST */}
        <section className="py-24 bg-white border-b border-wgc-navy-100">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <ScrollFade>
              <div className="inline-flex items-center px-6 py-3 rounded-xl bg-wgc-gold-500/10 text-wgc-gold-600 text-[11px] font-black uppercase tracking-widest border border-wgc-gold-500/20 font-mono mb-8">
                What WGC Does
              </div>
              <h2 className="text-4xl md:text-6xl font-bold text-wgc-navy-950 mb-6 tracking-tight">
                $0 processing cost to your organization
              </h2>
              <p className="text-lg text-wgc-navy-500 max-w-2xl mx-auto leading-relaxed mb-4">
                By default supporters have the opportunity to cover the fees so more of every gift goes straight to your mission at no cost to your organization.
              </p>
              <p className="text-sm text-wgc-navy-400 max-w-2xl mx-auto leading-relaxed">
                Prefer your organization to absorb the fee instead? That option is available too, at transparent, published rates — see the <Link href="/pricing" className="text-wgc-gold-600 font-bold hover:underline">pricing page</Link> for details.
              </p>
            </ScrollFade>
          </div>
        </section>

        {/* EVERYTHING IN ONE PLACE */}
        <section className="py-32 bg-white relative overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <ScrollFade>
              <div className="text-center mb-20">
                <div className="inline-flex items-center px-6 py-3 rounded-xl bg-wgc-navy-50 text-wgc-navy-950 text-[11px] font-black uppercase tracking-widest border border-wgc-navy-100 font-mono mb-8">
                  One Platform, Not Five Tools
                </div>
                <h2 className="text-4xl md:text-6xl font-bold text-wgc-navy-950 mb-6 tracking-tight">Everything in one place</h2>
                <p className="text-lg text-wgc-navy-500 max-w-2xl mx-auto leading-relaxed">
                  No more jumping between a payment processor, a supporter spreadsheet, a recurring-giving app, and your accounting software. It&apos;s all here.
                </p>
              </div>
            </ScrollFade>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {PLATFORM_FEATURES.map((feature, i) => (
                <ScrollFade key={feature.title} delay={i * 60}>
                  <CompactFeatureCard {...feature} />
                </ScrollFade>
              ))}
            </div>
          </div>
        </section>

        {/* TEAM ACCOUNTS SPOTLIGHT */}
        <section className="py-24 bg-wgc-off border-y border-wgc-navy-100">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <ScrollFade>
              <div className="grid lg:grid-cols-2 gap-16 items-center">
                <div>
                  <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white text-wgc-navy-600 text-[10px] font-bold tracking-[0.2em] uppercase mb-6 border border-wgc-navy-100 font-mono">
                    Your Entire Team. One Organization Account.
                  </div>
                  <h2 className="text-3xl md:text-5xl font-bold text-wgc-navy-950 mb-6 tracking-tight">
                    Stop sharing one login
                  </h2>
                  <p className="text-lg text-wgc-navy-500 leading-relaxed mb-6">
                    Executive directors, finance staff, front-office admins, and volunteer fundraisers all need different access. WGC gives every team member their own account — scoped to exactly what they need — without sharing credentials.
                  </p>
                  <p className="text-lg text-wgc-navy-500 leading-relaxed">
                    No more one shared password floating around the office, and no more guessing who changed what. Less time managing access, more time on the mission.
                  </p>
                </div>
                <div className="grid sm:grid-cols-2 gap-5">
                  {[
                    { role: "Owner", desc: "Full control — billing, team management, and every feature." },
                    { role: "Admin", desc: "Runs day-to-day operations: giving, donors, reports, and settings." },
                    { role: "Fundraiser", desc: "Manages campaigns and donor outreach without access to sensitive settings." },
                    { role: "Viewer", desc: "Read-only access for board members or auditors who just need visibility." },
                  ].map((r) => (
                    <div key={r.role} className="bg-white rounded-2xl border border-wgc-navy-100 p-6 shadow-sm">
                      <div className="text-[10px] font-black text-wgc-gold-600 uppercase tracking-widest mb-2 font-mono">{r.role}</div>
                      <p className="text-sm font-medium text-wgc-navy-600 leading-relaxed">{r.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </ScrollFade>
          </div>
        </section>

        {/* ORGANIZATIONS WE SERVE */}
        <section className="py-28 bg-white border-b border-wgc-navy-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <ScrollFade>
              <div className="text-center mb-16">
                <div className="inline-flex items-center px-6 py-3 rounded-xl bg-wgc-navy-50 text-wgc-navy-950 text-[11px] font-black uppercase tracking-widest border border-wgc-navy-100 font-mono mb-8">
                  Who We Serve
                </div>
                <h2 className="text-4xl md:text-6xl font-bold text-wgc-navy-950 mb-6 tracking-tight">
                  Built for organizations that move missions forward
                </h2>
                <p className="text-lg text-wgc-navy-500 max-w-2xl mx-auto leading-relaxed">
                  WGC serves a wide range of mission-driven organizations directly through the WGC platform, and also provides payment infrastructure for the software platforms that serve them.
                </p>
              </div>
            </ScrollFade>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { icon: Heart, title: "Nonprofits & Charities", desc: "Donor management, recurring giving, campaigns, and reporting for 501(c) organizations.", href: "/for/christian-nonprofits" },
                { icon: Building2, title: "Churches & Ministries", desc: "Giving, tithing, and stewardship tools built for congregations of every size.", href: "/for/churches" },
                { icon: GraduationCap, title: "Schools, PTAs & Booster Clubs", desc: "Dues, fundraisers, and event payments with team accounts for staff and volunteers.", href: "/for/schools" },
                { icon: Landmark, title: "Foundations", desc: "Grant-ready reporting, recurring giving, and multi-fund tracking in one dashboard.", href: "/for/foundations" },
                { icon: HandCoins, title: "Associations & Membership Organizations", desc: "Membership dues, renewals, invoicing, and member records, fully automated.", href: "/for/associations" },
                { icon: Building, title: "Community Organizations", desc: "Payments, supporter records, and reporting for community and civic groups.", href: "/for/christian-nonprofits" },
                { icon: Code2, title: "Software Platforms & ISVs", desc: "Embed WGC's payment infrastructure into your own software through a guided partnership.", href: "/software-partners" },
              ].map((v, i) => (
                <ScrollFade key={v.title} delay={i * 60}>
                  <Link href={v.href} className="group block h-full p-6 bg-wgc-off rounded-2xl border border-wgc-navy-100 hover:border-wgc-gold-500/40 hover:shadow-lg transition-all">
                    <div className="w-10 h-10 rounded-xl bg-white border border-wgc-navy-100 flex items-center justify-center text-wgc-gold-500 mb-5 group-hover:bg-wgc-gold-500 group-hover:text-wgc-navy-950 transition-all">
                      <v.icon className="w-5 h-5" />
                    </div>
                    <h3 className="text-[15px] font-bold text-wgc-navy-950 tracking-tight leading-snug mb-2">{v.title}</h3>
                    <p className="text-[12px] font-medium text-wgc-navy-500 leading-relaxed">{v.desc}</p>
                  </Link>
                </ScrollFade>
              ))}
            </div>
          </div>
        </section>

        {/* INTERACTIVE DEMO CTA */}
        <section className="py-20 bg-white border-y border-wgc-navy-100">
          <div className="max-w-4xl mx-auto px-4 text-center">
            <ScrollFade>
              <h2 className="text-3xl md:text-5xl font-bold text-wgc-navy-950 mb-6 tracking-tight">Explore the Platform</h2>
              <p className="text-lg text-wgc-navy-500 mb-10 max-w-2xl mx-auto">
                Step into our interactive deployment environment. Experience both the full admin dashboard and the donor giving experience.
              </p>
              <Link href="/demo" className="bg-wgc-navy-950 text-white inline-flex items-center justify-center px-8 py-4 text-[13px] font-bold rounded-2xl shadow-xl transform transition-all hover:scale-105 hover:bg-wgc-gold-500 hover:text-wgc-navy-950 uppercase tracking-widest">
                View Interactive Demo
              </Link>
            </ScrollFade>
          </div>
        </section>

        {/* WGC ADVANTAGE */}
        <section className="pt-20 pb-32 bg-wgc-off relative overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <ScrollFade>
              <div className="text-center mb-24">
                <div className="inline-flex items-center px-6 py-3 rounded-xl bg-white text-wgc-navy-950 text-[11px] font-black uppercase tracking-widest border border-wgc-navy-100 font-mono mb-12">
                   Time & Money Back
                </div>
                <h2 className="text-5xl sm:text-7xl lg:text-8xl font-black text-wgc-navy-950 tracking-tight mb-8 leading-none">The WGC Advantage</h2>
                <p className="text-[13px] text-wgc-navy-400 font-bold max-w-2xl mx-auto leading-relaxed tracking-widest opacity-70">
                  WGC handles payments, supporters, and operations so mission-driven organizations can spend less time on administration and more time on their mission.
                </p>
              </div>
            </ScrollFade>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-10 items-stretch">
              <ScrollFade className="lg:col-span-1">
                <div className="relative rounded-[3rem] overflow-hidden shadow-2xl h-full min-h-[450px] group border border-wgc-navy-100">
                    <Image
                      src="/images/partners.webp"
                      alt="Mission-driven organization staff saving time with WGC"
                      fill
                      sizes="(max-width: 1024px) 100vw, 45vw"
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 brightness-[0.85]"
                    />

                </div>
              </ScrollFade>

              <div className="lg:col-span-2 grid sm:grid-cols-2 gap-6">
                {IMPACT_ITEMS.map((item, i) => (
                  <ScrollFade key={i} delay={i * 100}>
                    <FeatureCard {...item} />
                  </ScrollFade>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="py-32 bg-wgc-navy-950 border-y border-white/5 relative overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <ScrollFade>
              <div className="text-center mb-24">
                <h2 className="text-5xl sm:text-7xl lg:text-8xl font-bold !text-white tracking-tight mb-6">How It Works</h2>
                <p className="text-[11px] font-black text-wgc-gold-500 tracking-[0.4em] font-mono">From First Gift to Full Reporting. Fully Managed.</p>
              </div>
            </ScrollFade>

            <div className="grid lg:grid-cols-3 gap-12 relative">
              <div className="hidden lg:block absolute top-1/2 left-0 w-full h-px bg-wgc-navy-800 -translate-y-1/2 opacity-40"></div>

              {/* Step 1 */}
              <ScrollFade delay={0}>
                <div className="relative bg-wgc-navy-950 rounded-[2.5rem] p-12 border border-white/10 shadow-2xl group hover:-translate-y-2 transition-transform duration-500">
                  <div className="w-12 h-12 rounded-full bg-white text-wgc-navy-950 flex items-center justify-center text-lg font-black mb-10 shadow-xl group-hover:scale-110 transition-transform">01</div>
                  <h3 className="text-xl font-black !text-white mb-4 tracking-tight">Set Up in Minutes</h3>
                  <p className="text-[13px] font-bold text-white/60 leading-relaxed mb-8 tracking-widest">Connect your bank, build your first giving page, and invite your team — no developer required.</p>
                  <Link href="/start" className="inline-flex items-center text-[11px] font-black text-wgc-gold-500 hover:text-white transition-colors tracking-[0.2em] font-mono">
                    Get Started
                  </Link>
                </div>
              </ScrollFade>

              {/* Step 2 */}
              <ScrollFade delay={150}>
                <div className="relative bg-wgc-navy-950 rounded-[2.5rem] p-12 border border-white/10 shadow-2xl group hover:-translate-y-2 transition-transform duration-500">
                  <div className="w-10 h-10 rounded-full bg-wgc-gold-500 text-wgc-navy-950 flex items-center justify-center text-lg font-black mb-10 shadow-xl group-hover:scale-110 transition-transform">02</div>
                  <h3 className="text-xl font-black !text-white mb-4 tracking-tight">Supporters Give</h3>
                  <p className="text-[13px] font-bold text-white/60 leading-relaxed mb-8 tracking-widest">One-time or recurring, by card, ACH, or digital wallet — and supporters can choose to cover the processing fee, at no cost to you.</p>
                  <Link href="/demo#donor-demo" className="inline-flex items-center text-[11px] font-black text-wgc-gold-500 hover:text-white transition-colors tracking-[0.2em] font-mono">
                    See the Giving Flow
                  </Link>
                </div>
              </ScrollFade>

              {/* Step 3 */}
              <ScrollFade delay={300}>
                <div className="relative bg-wgc-navy-950 rounded-[2.5rem] p-12 border border-white/10 shadow-2xl group hover:-translate-y-2 transition-transform duration-500">
                  <div className="w-10 h-10 rounded-full bg-wgc-navy-700 text-white flex items-center justify-center text-lg font-black mb-10 shadow-xl group-hover:scale-110 transition-transform">03</div>
                  <h3 className="text-xl font-black !text-white mb-4 tracking-tight">Run From One Dashboard</h3>
                  <p className="text-[13px] font-bold text-white/60 leading-relaxed mb-8 tracking-widest">Donors, recurring gifts, reports, statements, payouts, refunds, and your team — all in one place.</p>
                  <div className="inline-flex items-center text-[11px] font-black text-wgc-gold-500 tracking-[0.2em] font-mono">
                    That&apos;s It
                  </div>
                </div>
              </ScrollFade>
            </div>
          </div>
        </section>

        {/* MISSION STATEMENT */}
        <section className="relative py-40 overflow-hidden bg-wgc-navy-950 border-y border-white/5">
          <div className="relative z-10 max-w-4xl mx-auto px-4 text-center">
            <ScrollFade>
              <div className="w-20 h-1 bg-wgc-gold-500 mx-auto mb-16 rounded-full shadow-sm shadow-wgc-gold-500/20"></div>
              <blockquote className="space-y-12">
                <p className="text-4xl sm:text-5xl lg:text-7xl font-bold italic leading-[1.05] !text-white tracking-tight">
                  Every hour spent piecing together five different tools is an hour <span className="text-wgc-gold-500">not spent</span> on the mission. We built WGC so mission-driven organizations get both back.
                </p>
                <footer className="flex items-center justify-center gap-6">
                  <div className="w-12 h-px bg-white/20"></div>
                  <span className="text-[12px] font-black tracking-[0.4em] text-wgc-gold-500 font-mono">WGC</span>
                  <div className="w-12 h-px bg-white/20"></div>
                </footer>
              </blockquote>
            </ScrollFade>
          </div>
        </section>

        {/* RESOURCES & GUIDES: PROMINENT GRID */}
        <section className="py-20 bg-white relative overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <ScrollFade>
              <div className="text-center mb-12">
                <div className="text-[10px] font-black text-wgc-gold-500 tracking-[0.4em] mb-4 font-mono">
                  Resources & Guides
                </div>
                <h2 className="text-3xl font-bold text-wgc-navy-950 tracking-tight">
                  Giving & stewardship resources
                </h2>
              </div>

              <div className="grid grid-cols-1 gap-8 max-w-2xl mx-auto">
                 <Link href="/resources/church-payment-processing-guide-2026" className="group block text-center">
                    <h3 className="text-xl sm:text-2xl font-bold text-wgc-navy-950 tracking-tight resource-glow transition-all duration-500 group-hover:text-wgc-gold-500 group-hover:-translate-y-2 group-hover:scale-105">Best giving platform for churches and nonprofits in 2026</h3>
                 </Link>
                 <Link href="/resources/nonprofit-payment-processing-guide-2026" className="group block text-center">
                    <h3 className="text-xl sm:text-2xl font-bold text-wgc-navy-950 tracking-tight resource-glow transition-all duration-500 group-hover:text-wgc-gold-500 group-hover:-translate-y-2 group-hover:scale-105">How nonprofits can save time and money on donation management</h3>
                 </Link>
                 <Link href="/resources/church-payment-processing-pricing-guide" className="group block text-center">
                    <h3 className="text-xl sm:text-2xl font-bold text-wgc-gold-500 tracking-tight resource-glow transition-all duration-500 group-hover:text-wgc-navy-950 group-hover:-translate-y-2 group-hover:scale-105">WGC vs Omella vs Tithe.ly vs Givebutter: Fee & feature breakdown</h3>
                 </Link>
              </div>
            </ScrollFade>
          </div>
        </section>

        {/* COMPARISON */}
        <section className="py-24 bg-wgc-off border-t border-wgc-navy-50">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <ScrollFade>
              <div className="text-center mb-16">
                <h2 className="text-3xl font-bold text-wgc-navy-950 tracking-tight mb-4">More Than a Payment Processor</h2>
                <p className="text-lg text-wgc-navy-500 font-medium max-w-2xl mx-auto tracking-tight opacity-90">Why mission-driven organizations choose WGC over a giving page bolted onto a generic processor.</p>
              </div>
            </ScrollFade>

            <ScrollFade>
              <div className="overflow-x-auto rounded-3xl bg-white shadow-xl border border-wgc-navy-100">
                <table className="w-full text-left">
                  <thead className="bg-wgc-off text-wgc-navy-900">
                    <tr>
                      <th className="py-6 px-10 text-[10px] font-bold uppercase tracking-widest">Capability</th>
                      <th className="py-6 px-10 text-[10px] font-bold uppercase tracking-widest text-center text-wgc-gold-500">WGC Payments</th>
                      <th className="py-6 px-10 text-[10px] font-bold tracking-widest text-center text-wgc-navy-950/40 uppercase">Payment-Only Processors</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-wgc-navy-50">
                    {[
                      { f: 'Full platform', w: 'Supporters, recurring, reports, team & more', s: 'Payments only' },
                      { f: 'Team accounts', w: 'Owner / Admin / Fundraiser / Viewer roles', s: 'One shared login' },
                      { f: 'Processing cost', w: '$0 to your org when supporters cover it', s: 'Org always pays' },
                    ].map((row) => (
                      <tr key={row.f}>
                        <td className="py-6 px-10 font-bold text-wgc-navy-900 tracking-tight">{row.f}</td>
                        <td className="py-6 px-10 text-center font-bold text-wgc-navy-700 bg-wgc-gold-500/5 tracking-tight">{row.w}</td>
                        <td className="py-6 px-10 text-center text-wgc-navy-950 font-medium tracking-tight">{row.s}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ScrollFade>
          </div>
        </section>

        {/* SWITCH TO WGC / MIGRATION */}
        <section className="py-24 bg-wgc-navy-950 border-y border-white/5">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <ScrollFade>
              <div className="inline-flex items-center px-6 py-3 rounded-xl bg-white/5 text-white text-[11px] font-black uppercase tracking-widest border border-white/10 font-mono mb-8">
                Already Using Another Platform?
              </div>
              <h2 className="text-3xl md:text-5xl font-bold !text-white mb-6 tracking-tight">
                Switch to WGC without starting over
              </h2>
              <p className="text-lg text-white/70 max-w-2xl mx-auto leading-relaxed mb-4">
                Bring your donor records, giving history, funds, and organization data with you. Moving from Givebutter, Zeffy, Donorbox, Stripe, another church platform, or a spreadsheet doesn&apos;t mean starting from zero.
              </p>
              <p className="text-sm text-white/50 max-w-2xl mx-auto leading-relaxed mb-10">
                Recurring giving can be reviewed during migration, and we&apos;ll help determine the best path based on your current provider.
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-4">
                <Link href="/switch" className="bg-wgc-gold-500 text-wgc-navy-950 inline-flex items-center justify-center px-8 py-4 text-[13px] font-bold rounded-2xl shadow-xl transform transition-all hover:scale-105 hover:bg-white uppercase tracking-widest">
                  Start Your Migration
                </Link>
                <Link href="/contact" className="bg-white/10 text-white inline-flex items-center justify-center px-8 py-4 text-[13px] font-bold rounded-2xl border border-white/20 transition-all hover:bg-white hover:text-wgc-navy-950 uppercase tracking-widest">
                  Talk to Us About Migrating
                </Link>
              </div>
            </ScrollFade>
          </div>
        </section>

        {/* FREQUENTLY ASKED QUESTIONS (SEO) */}
        <section className="py-24 bg-white relative">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <ScrollFade>
              <div className="text-center mb-16">
                <h2 className="text-3xl font-bold text-wgc-navy-950 tracking-tight mb-4">Frequently Asked Questions</h2>
                <p className="text-lg text-wgc-navy-500 font-medium tracking-tight">Learn more about how WGC is building the giving and payment management platform for mission-driven organizations in 2026.</p>
              </div>
              <div className="space-y-8">
                <div className="bg-wgc-off p-8 rounded-3xl border border-wgc-navy-50">
                  <h3 className="text-xl font-bold text-wgc-navy-950 mb-3">Is WGC just a payment processor?</h3>
                  <p className="text-wgc-navy-500 leading-relaxed font-medium">No. WGC is a fundraising, payments, and donor management platform for mission-driven organizations — nonprofits, churches and ministries, foundations, associations, schools, and community organizations. Beyond accepting card, ACH, and digital wallet payments, WGC includes donor profiles and donation history, recurring giving, giving and campaign pages, invoicing, external and offline donation recording, reporting and donor analytics with CSV exports, settlements and payouts, refunds, year-end statements, team accounts with role-based permissions (Owner, Admin, Fundraiser, Viewer), and accounting integrations with QuickBooks and Aplos — all in one dashboard, instead of piecing together separate tools.</p>
                </div>
                <div className="bg-wgc-off p-8 rounded-3xl border border-wgc-navy-50">
                  <h3 className="text-xl font-bold text-wgc-navy-950 mb-3">Can I switch to WGC from Givebutter, Zeffy, Donorbox, Stripe, or another platform?</h3>
                  <p className="text-wgc-navy-500 leading-relaxed font-medium">Yes. WGC helps you migrate donor and contact records, historical and external donation data, funds, and organization information from another fundraising or payment platform — including CSV imports and spreadsheet-based donor databases. Saved card or bank details generally can&apos;t be transferred automatically between processors; recurring giving is reviewed during migration, and we&apos;ll help determine the best path based on your current provider. See our <Link href="/switch" className="text-wgc-gold-600 font-bold hover:underline">migration guide</Link> for details.</p>
                </div>
                <div className="bg-wgc-off p-8 rounded-3xl border border-wgc-navy-50">
                  <h3 className="text-xl font-bold text-wgc-navy-950 mb-3">How much does WGC cost for a nonprofit, church, or other organization?</h3>
                  <p className="text-wgc-navy-500 leading-relaxed font-medium">When a supporter chooses to cover the processing fee, the cost to the organization is $0. Organizations that choose to absorb the fee pay a maximum of 2.3% + 25¢ per card transaction and a flat 25¢ per ACH transaction. Every organization also pays a simple $10/month WGC platform fee, which includes full access to the dashboard and every platform feature — not just payment processing.</p>
                </div>
                <div className="bg-wgc-off p-8 rounded-3xl border border-wgc-navy-50">
                  <h3 className="text-xl font-bold text-wgc-navy-950 mb-3">Does WGC support team accounts and staff permissions?</h3>
                  <p className="text-wgc-navy-500 leading-relaxed font-medium">Yes. WGC supports Owner, Admin, Fundraiser, and Viewer roles so any organization can give each staff member or volunteer their own login with access scoped to what they actually need, instead of sharing one account and password.</p>
                </div>
                <div className="bg-wgc-off p-8 rounded-3xl border border-wgc-navy-50">
                  <h3 className="text-xl font-bold text-wgc-navy-950 mb-3">What&apos;s the best alternative to Omella, Tithe.ly, Givebutter, or Zeffy?</h3>
                  <p className="text-wgc-navy-500 leading-relaxed font-medium">WGC is built for nonprofits, churches, foundations, associations, schools, and other mission-driven organizations that want more than a giving page — it combines supporter management, recurring giving, campaigns, invoicing, reporting, settlements, refunds, year-end statements, team accounts with role-based permissions, and accounting integrations in one platform, with a $0 processing cost option when supporters cover the fee.</p>
                </div>
              </div>
            </ScrollFade>
          </div>
        </section>

        {/* INTEGRATIONS */}
        <section className="py-20 bg-wgc-off border-y border-wgc-navy-100">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <ScrollFade>
              <div className="inline-flex items-center px-6 py-3 rounded-xl bg-white text-wgc-navy-950 text-[11px] font-black uppercase tracking-widest border border-wgc-navy-100 font-mono mb-8">
                Integrations
              </div>
              <h2 className="text-3xl md:text-5xl font-bold text-wgc-navy-950 mb-6 tracking-tight">
                Connects to the tools you already use
              </h2>
              <p className="text-lg text-wgc-navy-500 max-w-2xl mx-auto leading-relaxed mb-8">
                Sync giving and transactions directly into QuickBooks or Aplos, embed a giving form on your own website, and accept cards, ACH, Apple Pay, and Google Pay — no manual data entry required.
              </p>
              <Link href="/integrations" className="inline-flex items-center text-[13px] font-bold text-wgc-gold-600 hover:text-wgc-navy-950 transition-colors">
                See all integrations &rarr;
              </Link>
            </ScrollFade>
          </div>
        </section>

        {/* SOFTWARE PLATFORMS / ISV TEASER */}
        <section className="py-20 bg-wgc-navy-950 border-b border-white/5">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <ScrollFade>
              <div className="inline-flex items-center px-6 py-3 rounded-xl bg-white/5 text-white text-[11px] font-black uppercase tracking-widest border border-white/10 font-mono mb-8">
                For Software Platforms
              </div>
              <h2 className="text-3xl md:text-5xl font-bold !text-white mb-6 tracking-tight">
                Build payments into your own software
              </h2>
              <p className="text-lg text-white/70 max-w-2xl mx-auto leading-relaxed mb-10">
                WGC serves organizations directly through our dashboard, and also partners with software platforms that serve mission-driven organizations to embed our payment infrastructure into their own product.
              </p>
              <Link href="/software-partners" className="bg-wgc-gold-500 text-wgc-navy-950 inline-flex items-center justify-center px-8 py-4 text-[13px] font-bold rounded-2xl shadow-xl transform transition-all hover:scale-105 hover:bg-white uppercase tracking-widest">
                Explore Software Partnerships
              </Link>
            </ScrollFade>
          </div>
        </section>

        {/* FINAL CALL */}
        <section className="bg-wgc-navy-950 pb-20 border-t border-white/5">
          <CTASection
            headline="Ready to give your team their time back?"
            subheadline="Join the mission-driven organizations using WGC to run payments, supporters, and operations from one place."
            ctaText="Get Started"
            ctaLink="/start"
          />
        </section>
      </main>
      <Footer />
    </>
  );
}

function CompactFeatureCard({ icon: Icon, title, description, badge }: { icon: LucideIcon; title: string; description: string; badge?: string }) {
  return (
    <div className="p-6 bg-white rounded-2xl border border-wgc-navy-100 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 h-full flex flex-col group">
      <div className="w-10 h-10 rounded-xl bg-wgc-navy-50 border border-wgc-navy-100 flex items-center justify-center text-wgc-gold-500 mb-5 group-hover:bg-wgc-gold-500 group-hover:text-wgc-navy-950 transition-all duration-300">
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <h3 className="text-[15px] font-bold text-wgc-navy-950 tracking-tight leading-snug">{title}</h3>
        {badge && (
          <span className="px-2 py-0.5 rounded-full bg-wgc-navy-50 border border-wgc-navy-100 text-wgc-navy-400 text-[8px] font-black uppercase tracking-widest">
            {badge}
          </span>
        )}
      </div>
      <p className="text-[12px] font-medium text-wgc-navy-500 leading-relaxed">{description}</p>
    </div>
  );
}
