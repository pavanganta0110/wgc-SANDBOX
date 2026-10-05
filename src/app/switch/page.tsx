import type { Metadata } from "next";
import Link from "next/link";
import {
  Users, FileText, Landmark, Megaphone, Repeat, Building2, Upload, Table, CheckCircle2, LucideIcon,
} from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import CTASection from "@/components/ui/CTASection";
import ScrollFade from "@/components/ui/ScrollFade";
import { pageGraph, breadcrumbs } from "@/lib/schema";

export const metadata: Metadata = {
  title: "Switch to WGC | Nonprofit Platform Migration",
  description: "Moving from Givebutter, Zeffy, Donorbox, Stripe, Pushpay, another church platform, or a spreadsheet? Migrate your donor data, giving history, and organization records to WGC without starting over.",
  openGraph: {
    images: [{ url: "/og/default.png", width: 1200, height: 630 }],
    title: "Switch to WGC | Nonprofit Platform Migration",
    description: "Migrate your donor data, giving history, and organization records to WGC without starting over.",
    url: "https://www.wgcpayments.com/switch",
  },
  alternates: { canonical: "/switch" },
};

const MIGRATION_ITEMS: { icon: LucideIcon; title: string; description: string }[] = [
  { icon: Users, title: "Donor & contact records", description: "Names, emails, phone numbers, and addresses come with you." },
  { icon: FileText, title: "Historical donation data", description: "Past gifts recorded outside WGC can be entered as external donation history, so your reporting stays complete." },
  { icon: Landmark, title: "Funds, purposes & categories", description: "Recreate your existing designations so giving stays organized the way your team already tracks it." },
  { icon: Megaphone, title: "Campaign records", description: "Rebuild past or active campaigns as WGC giving pages and campaign links." },
  { icon: Repeat, title: "Recurring giving information", description: "We'll review your existing recurring donors with you and help determine the best migration path for each." },
  { icon: Building2, title: "Organization & team information", description: "Bring over your team structure and set up Owner, Admin, Fundraiser, and Viewer accounts." },
  { icon: Upload, title: "CSV imports", description: "Import donor and donation data exported from another fundraising platform via CSV." },
  { icon: Table, title: "Spreadsheet-based donor databases", description: "If you've been tracking donors in a spreadsheet, we'll help you bring that data into WGC." },
];

const FAQS = [
  {
    question: "Can WGC automatically migrate our saved credit cards or bank accounts?",
    answer: "No — payment credentials (saved cards, bank accounts, and tokens) are stored with your current payment processor and generally can't be transferred automatically to a new one. Depending on your provider, this may require a secure processor-to-processor migration or your donors reauthorizing their payment method with WGC.",
  },
  {
    question: "Will our recurring donors need to do anything?",
    answer: "It depends on your current provider. We'll review your recurring giving with you during migration and help determine the best path — in some cases donors may need to re-enter payment details; in others we can work with your provider directly. We won't promise automatic migration of every recurring donor unless we've confirmed it's possible for your specific setup.",
  },
  {
    question: "Can we bring over donation history from Givebutter, Zeffy, Donorbox, or Stripe?",
    answer: "Yes — export your donation history as a CSV from your current platform, and we can import it as external donation history in WGC so your reporting and donor records stay complete.",
  },
  {
    question: "What if we've only ever used a spreadsheet?",
    answer: "That's a common starting point. We can import your spreadsheet as donor records and historical donations, so you're not manually re-entering years of giving history.",
  },
  {
    question: "How long does migration take?",
    answer: "It depends on how much data you're bringing over and how it's currently stored. Talk to us about your specific platform and data, and we'll walk you through what migration looks like for your organization.",
  },
];

const jsonLd = pageGraph(
  breadcrumbs([
    { name: "Home", path: "/" },
    { name: "Switch to WGC", path: "/switch" },
  ]),
  {
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  }
);

export default function SwitchPage() {
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
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
            <ScrollFade>
              <div className="inline-flex items-center gap-3 px-5 py-2 rounded-xl mb-8 border border-wgc-gold-500/20 bg-wgc-gold-500/5">
                <span className="text-[10px] font-black uppercase tracking-[0.4em] text-wgc-gold-500/90 font-mono">Nonprofit Platform Migration</span>
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] mb-6 !text-white">
                Switch to WGC without starting over
              </h1>
              <p className="text-lg sm:text-xl font-medium leading-relaxed text-white/70 max-w-2xl mx-auto tracking-tight mb-10">
                Bring your donors, giving history, funds, contacts, and organization data with you. WGC helps make moving from your existing fundraising or payment platform easier.
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-4">
                <Link href="/start" className="bg-wgc-gold-500 text-wgc-navy-950 inline-flex items-center justify-center px-8 py-4 text-[13px] font-bold rounded-2xl shadow-xl transform transition-all hover:scale-105 hover:bg-white uppercase tracking-widest">
                  Start Your Migration
                </Link>
                <Link href="/contact" className="bg-white/10 text-white inline-flex items-center justify-center px-8 py-4 text-[13px] font-bold rounded-2xl border border-white/20 transition-all hover:bg-white hover:text-wgc-navy-950 uppercase tracking-widest">
                  Talk to Us About Migrating
                </Link>
              </div>
            </ScrollFade>
          </div>
        </section>

        {/* WHO THIS IS FOR */}
        <section className="py-16 bg-white border-b border-wgc-navy-100">
          <div className="max-w-4xl mx-auto px-4 text-center">
            <ScrollFade>
              <p className="text-wgc-navy-500 leading-relaxed text-lg">
                Moving from <span className="font-bold text-wgc-navy-900">Givebutter</span>, <span className="font-bold text-wgc-navy-900">Zeffy</span>, <span className="font-bold text-wgc-navy-900">Donorbox</span>, <span className="font-bold text-wgc-navy-900">Stripe</span>, <span className="font-bold text-wgc-navy-900">Pushpay</span>, another church or nonprofit platform, or a spreadsheet? You don&apos;t have to start from scratch.
              </p>
            </ScrollFade>
          </div>
        </section>

        {/* WHAT MOVES WITH YOU */}
        <section className="py-24 bg-wgc-off">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <ScrollFade>
              <div className="text-center mb-16 max-w-2xl mx-auto">
                <h2 className="text-3xl md:text-4xl font-bold text-wgc-navy-950 tracking-tight mb-4">What can move with you</h2>
                <p className="text-wgc-navy-500 leading-relaxed">Move your donor records, giving history, and organization data into WGC so your team keeps the history it already has.</p>
              </div>
            </ScrollFade>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {MIGRATION_ITEMS.map((item, i) => (
                <ScrollFade key={item.title} delay={i * 50}>
                  <div className="p-6 bg-white rounded-2xl border border-wgc-navy-100 h-full flex flex-col shadow-sm">
                    <div className="w-10 h-10 rounded-xl bg-wgc-navy-50 border border-wgc-navy-100 flex items-center justify-center text-wgc-gold-500 mb-4">
                      <item.icon className="w-5 h-5" />
                    </div>
                    <h3 className="text-[15px] font-bold text-wgc-navy-950 tracking-tight mb-2">{item.title}</h3>
                    <p className="text-[12px] font-medium text-wgc-navy-500 leading-relaxed">{item.description}</p>
                  </div>
                </ScrollFade>
              ))}
            </div>
          </div>
        </section>

        {/* WHAT DOESN'T AUTOMATICALLY MOVE */}
        <section className="py-16 bg-white border-y border-wgc-navy-100">
          <div className="max-w-3xl mx-auto px-4">
            <ScrollFade>
              <div className="p-8 rounded-3xl border border-wgc-navy-100 bg-wgc-off">
                <h3 className="text-lg font-bold text-wgc-navy-900 mb-3 flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-wgc-gold-600 shrink-0" />
                  A note on payment credentials
                </h3>
                <p className="text-[15px] font-medium text-wgc-navy-500 leading-relaxed">
                  Saved credit cards, bank accounts, and payment tokens are stored with your current processor and generally can&apos;t be transferred automatically. Depending on your provider, moving them may require a secure processor-to-processor migration or your donors reauthorizing their payment method. Recurring giving is reviewed during migration, and we&apos;ll help determine the best path based on your existing provider.
                </p>
              </div>
            </ScrollFade>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-24 bg-wgc-off">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <ScrollFade>
              <div className="text-center mb-16">
                <h2 className="text-3xl font-bold text-wgc-navy-950 tracking-tight mb-4">Migration, answered</h2>
              </div>
              <div className="space-y-8">
                {FAQS.map((faq) => (
                  <div key={faq.question} className="bg-white p-8 rounded-3xl border border-wgc-navy-100">
                    <h3 className="text-xl font-bold text-wgc-navy-950 mb-3">{faq.question}</h3>
                    <p className="text-wgc-navy-500 leading-relaxed font-medium">{faq.answer}</p>
                  </div>
                ))}
              </div>
            </ScrollFade>
          </div>
        </section>

        <CTASection
          headline="Moving from another platform? We can help."
          subheadline="Talk to us about your current setup and let us walk you through what migration looks like for your organization."
          ctaText="Talk to Us About Migrating"
          ctaLink="/contact"
        />
      </main>
      <Footer />
    </>
  );
}
