import type { Metadata } from "next";
import Link from "next/link";
import {
  CreditCard, Banknote, Smartphone, Plug, Webhook, Code2, LayoutTemplate, LucideIcon,
} from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import CTASection from "@/components/ui/CTASection";
import ScrollFade from "@/components/ui/ScrollFade";
import { pageGraph, breadcrumbs } from "@/lib/schema";

export const metadata: Metadata = {
  title: "Integrations | Accounting, Payments & Developer Tools | WGC",
  description: "See every WGC integration: QuickBooks and Aplos accounting sync, card/ACH/Apple Pay/Google Pay payments, embeddable giving forms, and what's coming next for developers and software partners.",
  openGraph: {
    images: [{ url: "/og/verticals.png", width: 1200, height: 630 }],
    title: "Integrations | Accounting, Payments & Developer Tools | WGC",
    description: "Every WGC integration, organized by category — accounting, payments, and developer tools.",
    url: "https://www.wgcpayments.com/integrations",
  },
  alternates: { canonical: "/integrations" },
};

interface IntegrationItem {
  icon: LucideIcon;
  title: string;
  description: string;
  status: "Available" | "Coming Soon";
}

interface IntegrationCategory {
  title: string;
  description: string;
  items: IntegrationItem[];
}

const CATEGORIES: IntegrationCategory[] = [
  {
    title: "Accounting",
    description: "Sync giving and transactions directly into the accounting software you already use.",
    items: [
      { icon: Plug, title: "QuickBooks", description: "Automatically sync donors and transactions into QuickBooks as they're processed.", status: "Available" },
      { icon: Plug, title: "Aplos", description: "Full-lifecycle sync with fund and account mapping, built for nonprofit fund accounting.", status: "Available" },
    ],
  },
  {
    title: "Payments",
    description: "Accept every common way a supporter wants to give or pay.",
    items: [
      { icon: CreditCard, title: "Cards", description: "All major credit and debit cards, capped processing rates.", status: "Available" },
      { icon: Banknote, title: "ACH Bank Transfer", description: "Flat 25¢ per transfer, ideal for large or recurring gifts.", status: "Available" },
      { icon: Smartphone, title: "Apple Pay", description: "One-tap digital wallet checkout on supported giving pages.", status: "Available" },
      { icon: Smartphone, title: "Google Pay", description: "One-tap digital wallet checkout on supported giving pages.", status: "Available" },
    ],
  },
  {
    title: "Developer / Platform",
    description: "For organizations and software platforms that want to extend WGC into their own website or product.",
    items: [
      { icon: LayoutTemplate, title: "Embeddable Giving Forms", description: "Generate an embed snippet to add a donate button or inline giving form to your own website (WordPress, Wix, Squarespace, Webflow, and more).", status: "Available" },
      { icon: Webhook, title: "Webhooks", description: "Event notifications for payments, subscriptions, and settlements delivered to your own systems.", status: "Coming Soon" },
      { icon: Code2, title: "Public API Access", description: "Self-serve API keys for software partners to build directly on WGC's payment infrastructure.", status: "Coming Soon" },
    ],
  },
];

const jsonLd = pageGraph(
  breadcrumbs([
    { name: "Home", path: "/" },
    { name: "Integrations", path: "/integrations" },
  ]),
  {
    "@type": "ItemList",
    name: "WGC Integrations",
    itemListElement: CATEGORIES.flatMap((cat) => cat.items).map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.title,
      description: item.description,
    })),
  }
);

export default function IntegrationsPage() {
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
                <span className="text-[10px] font-black uppercase tracking-[0.4em] text-wgc-gold-500/90 font-mono">Integrations</span>
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] mb-6 !text-white">
                Connects to the tools you already use
              </h1>
              <p className="text-lg sm:text-xl font-medium leading-relaxed text-white/70 max-w-2xl mx-auto tracking-tight">
                WGC is built specifically for nonprofits, so your organization doesn&apos;t have to assemble fundraising, donor management, and payment tools yourself.
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
                          <span className={
                            item.status === "Available"
                              ? "px-2 py-0.5 rounded-full bg-green-50 border border-green-200 text-green-700 text-[8px] font-black uppercase tracking-widest"
                              : "px-2 py-0.5 rounded-full bg-white border border-wgc-navy-100 text-wgc-navy-400 text-[8px] font-black uppercase tracking-widest"
                          }>
                            {item.status}
                          </span>
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

        {/* POSITIONING NOTE */}
        <section className="py-16 bg-wgc-off border-t border-wgc-navy-100">
          <div className="max-w-3xl mx-auto px-4 text-center">
            <ScrollFade>
              <p className="text-wgc-navy-500 leading-relaxed">
                We won&apos;t claim to match the size of a general-purpose ecosystem like Stripe&apos;s. Instead, WGC focuses on the accounting, payment, and website integrations nonprofits actually use — built in, not bolted on. Have a specific integration in mind?{" "}
                <Link href="/contact" className="text-wgc-gold-600 font-bold hover:underline">Tell us what you need</Link>.
              </p>
            </ScrollFade>
          </div>
        </section>

        <CTASection
          headline="Ready to connect your tools?"
          subheadline="Get started with WGC and sync your accounting, payments, and giving pages in one place."
          ctaText="Get Started"
          ctaLink="/start"
        />
      </main>
      <Footer />
    </>
  );
}
