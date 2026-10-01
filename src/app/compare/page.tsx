import Link from "next/link";
import { CheckCircle2, Minus } from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import CTASection from "@/components/ui/CTASection";
import ScrollFade from "@/components/ui/ScrollFade";
import { pageGraph, breadcrumbs } from "@/lib/schema";
import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "/compare" },
  title: "WGC vs. Tithe.ly, Pushpay, Givebutter & More | Platform Comparison",
  description: "See how WGC's card rate, ACH rate, and monthly platform fee compare to Tithe.ly, Pushpay, Givebutter, Subsplash, Givelify, Donorbox, Planning Center Giving, Vanco, and Breeze ChMS.",
  openGraph: {
    images: [{ url: "/og/default.png", width: 1200, height: 630 }],
    title: "WGC vs. Tithe.ly, Pushpay, Givebutter & More | Platform Comparison",
    description: "A side-by-side look at card rates, ACH rates, and monthly platform fees across 9 church and nonprofit giving platforms.",
    url: "https://www.wgcpayments.com/compare",
  },
};

type Row = {
  name: string;
  card: string;
  ach: string;
  platformFee: string;
  note: string;
  href?: string;
  highlight?: boolean;
};

// Published starting rates as of September 2026, gathered from each
// vendor's own pricing page or recent independent teardowns. Plans,
// negotiated enterprise pricing, and bundled add-ons vary — confirm
// directly with a vendor before treating any single figure as final.
const ROWS: Row[] = [
  {
    name: "WGC",
    card: "2.3% + $0.25 (capped)",
    ach: "25¢ flat",
    platformFee: "$10/mo",
    note: "$0 to your org by default — supporters can cover the fee. Recurring charges add 0.1%.",
    highlight: true,
  },
  {
    name: "Tithe.ly",
    card: "2.9% + $0.30 (2.5% + $0.25 on Pro)",
    ach: "~1%",
    platformFee: "$0–$119/mo",
    note: "Free tier is a hosted form only; dashboards, reports, and the app need Pro.",
  },
  {
    name: "Pushpay",
    card: "2.9% + $0.30",
    ach: "1% + $0.30",
    platformFee: "Quote-based, ~$200–1,475+/mo",
    note: "No public pricing. Independent teardowns put a 1,500-member church near $17.7K/year before per-transaction fees.",
  },
  {
    name: "Givebutter",
    card: "2.9% + $0.30",
    ach: "2.9% + $0.30",
    platformFee: "$0 (optional donor tip)",
    note: "Free at the platform level, but funded by a tip prompt on every gift — effectively 3–5% when tips are included.",
  },
  {
    name: "Subsplash",
    card: "2.3%–2.99% + $0.30",
    ach: "1%",
    platformFee: "Quote-based, from ~$159/mo",
    note: "Giving isn't sold standalone — it's bundled with app, website, and media hosting.",
  },
  {
    name: "Givelify",
    card: "2.9% + $0.30 (1.5% + $0.30 on Plus)",
    ach: "N/A",
    platformFee: "$0 ($99/mo for Plus)",
    note: "No published ACH rate — donations are card/wallet-based.",
  },
  {
    name: "Donorbox",
    card: "~2.2% + $0.30 processor fee, plus a 2.95% platform fee (Standard)",
    ach: "Same stacked fee structure",
    platformFee: "$0–$150/mo",
    note: "Two fees stack on every gift — the processor's cut and Donorbox's own platform cut.",
  },
  {
    name: "Planning Center Giving",
    card: "2.15% + $0.30",
    ach: "$0.30 flat",
    platformFee: "$0–$239/mo (by donation volume)",
    note: "Same processing rate for every tier, but the subscription climbs with how many donations you take.",
  },
  {
    name: "Vanco Faith",
    card: "2.9% + $0.45 (2.65% + $0.39 on Thrive)",
    ach: "1% + $0.45 (0.9% + $0.39 on Thrive)",
    platformFee: "$0–$54/mo",
    note: "ACH still carries a percentage on top of the flat fee, unlike a flat-rate ACH model.",
  },
  {
    name: "Breeze ChMS",
    card: "~2.9% + $0.30",
    ach: "~1%",
    platformFee: "~$67–$119/mo",
    note: "Giving rides along with its church-management bundle — now under Tithe.ly's ownership.",
  },
];

const FAQS = [
  {
    question: "How does WGC's pricing compare to Tithe.ly, Pushpay, and Givebutter?",
    answer: "WGC caps card processing at 2.3% + $0.25 and charges a flat 25¢ per ACH transfer, for a $10/month platform fee. Tithe.ly, Pushpay, Givebutter, and most other platforms charge a percentage on ACH as well as cards — which costs meaningfully more as transfer size grows, since a percentage fee has no ceiling the way WGC's flat ACH rate does.",
  },
  {
    question: "Is Givebutter actually free compared to WGC's $10/month fee?",
    answer: "Givebutter doesn't charge a monthly platform fee, but it funds itself through a tip prompt shown to the donor on every gift. Many donors leave a tip, which puts Givebutter's effective cost in a similar 3–5% range to platforms with a flat monthly fee — it's a different mechanism, not necessarily a lower total cost.",
  },
  {
    question: "Why does ACH pricing vary so much between these platforms?",
    answer: "Some platforms (WGC, Planning Center Giving) charge a flat fee per ACH transfer, so the fee doesn't grow with the gift size. Others (Pushpay, Vanco, Donorbox, Givebutter) charge a percentage on ACH the same way they do on cards, which costs more in dollar terms on larger transfers — common for big tithes, capital campaign gifts, or stock/DAF-adjacent bank transfers.",
  },
  {
    question: "Which of these platforms charge a separate monthly platform fee on top of transaction fees?",
    answer: "Most do. Tithe.ly, Pushpay, Subsplash, Planning Center Giving, Vanco, and Breeze ChMS all charge some form of recurring subscription in addition to per-transaction fees. Givebutter and Givelify's free tiers skip the subscription but recover revenue through donor tips or a paid upgrade tier (Givelify Plus) instead.",
  },
];

const jsonLd = pageGraph(
  breadcrumbs([
    { name: "Home", path: "/" },
    { name: "Compare", path: "/compare" },
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

export default function ComparePage() {
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
          <div className="absolute inset-0 opacity-[0.05] pointer-events-none">
            <svg className="w-full h-full" fill="none" stroke="currentColor">
              <pattern id="compare-grid" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" strokeWidth="1" className="text-wgc-navy-300" />
              </pattern>
              <rect width="100%" height="100%" fill="url(#compare-grid)" />
            </svg>
          </div>
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
            <ScrollFade>
              <div className="inline-flex items-center gap-3 px-5 py-2 rounded-xl mb-8 border border-wgc-gold-500/20 bg-wgc-gold-500/5">
                <span className="text-[10px] font-black uppercase tracking-[0.4em] text-wgc-gold-500/90 font-mono">Platform Comparison</span>
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] mb-6 !text-white">
                WGC vs. 9 other giving platforms
              </h1>
              <p className="text-lg sm:text-xl font-medium leading-relaxed text-white/70 max-w-2xl mx-auto tracking-tight mb-10">
                Card rate, ACH rate, and monthly platform fee — side by side, with sources, so you can see exactly where WGC stands before you switch.
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-4">
                <Link href="/pricing" className="bg-wgc-gold-500 text-wgc-navy-950 inline-flex items-center justify-center px-8 py-4 text-[13px] font-bold rounded-2xl shadow-xl transform transition-all hover:scale-105 hover:bg-white uppercase tracking-widest">
                  See WGC&apos;s Full Pricing
                </Link>
                <Link href="/switch" className="bg-white/10 text-white inline-flex items-center justify-center px-8 py-4 text-[13px] font-bold rounded-2xl border border-white/20 transition-all hover:bg-white hover:text-wgc-navy-950 uppercase tracking-widest">
                  Migrate From Another Platform
                </Link>
              </div>
            </ScrollFade>
          </div>
        </section>

        {/* TABLE */}
        <section className="py-24 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <ScrollFade>
              <div className="overflow-x-auto rounded-3xl border border-wgc-navy-100 shadow-sm">
                <table className="w-full min-w-[920px] text-left border-collapse">
                  <thead>
                    <tr className="bg-wgc-navy-950">
                      <th className="px-6 py-5 text-[11px] font-black uppercase tracking-[0.2em] text-white/60 font-mono">Platform</th>
                      <th className="px-6 py-5 text-[11px] font-black uppercase tracking-[0.2em] text-white/60 font-mono">Card rate</th>
                      <th className="px-6 py-5 text-[11px] font-black uppercase tracking-[0.2em] text-white/60 font-mono">ACH rate</th>
                      <th className="px-6 py-5 text-[11px] font-black uppercase tracking-[0.2em] text-white/60 font-mono">Platform fee</th>
                      <th className="px-6 py-5 text-[11px] font-black uppercase tracking-[0.2em] text-white/60 font-mono">What to know</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ROWS.map((row) => (
                      <tr
                        key={row.name}
                        className={
                          row.highlight
                            ? "bg-wgc-gold-500/10 border-b border-wgc-gold-500/20"
                            : "bg-white border-b border-wgc-navy-50 last:border-b-0"
                        }
                      >
                        <td className="px-6 py-6 align-top">
                          <div className="flex items-center gap-2">
                            {row.highlight && <CheckCircle2 className="w-4 h-4 text-wgc-gold-600 shrink-0" />}
                            <span className={row.highlight ? "font-black text-wgc-navy-950" : "font-bold text-wgc-navy-900"}>
                              {row.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-6 align-top text-[14px] font-semibold text-wgc-navy-800">{row.card}</td>
                        <td className="px-6 py-6 align-top text-[14px] font-semibold text-wgc-navy-800">
                          {row.ach === "N/A" ? (
                            <span className="inline-flex items-center gap-1 text-wgc-navy-400">
                              <Minus className="w-3.5 h-3.5" /> N/A
                            </span>
                          ) : (
                            row.ach
                          )}
                        </td>
                        <td className="px-6 py-6 align-top text-[14px] font-semibold text-wgc-navy-800">{row.platformFee}</td>
                        <td className="px-6 py-6 align-top text-[13px] font-medium text-wgc-navy-500 leading-relaxed max-w-xs">{row.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ScrollFade>
            <ScrollFade>
              <p className="mt-6 text-[12px] font-medium text-wgc-navy-400 leading-relaxed max-w-3xl">
                Rates shown are each vendor&apos;s own published starting rates, or figures from recent independent teardowns, as of September 2026. Plans, bundled add-ons, and negotiated enterprise pricing vary by vendor — confirm current numbers directly with a platform before signing a contract. See WGC&apos;s own rates in full on the <Link href="/pricing" className="text-wgc-gold-600 font-bold hover:underline">pricing page</Link>.
              </p>
            </ScrollFade>
          </div>
        </section>

        {/* WHY FLAT ACH MATTERS */}
        <section className="py-24 bg-wgc-off border-y border-wgc-navy-100">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <ScrollFade>
              <div className="text-center max-w-2xl mx-auto mb-12">
                <h2 className="text-3xl md:text-4xl font-bold text-wgc-navy-950 tracking-tight mb-4">The gap shows up most on bank transfers</h2>
                <p className="text-wgc-navy-500 leading-relaxed">Most of the table above charges a percentage on ACH, the same way it charges on cards. WGC charges a flat 25¢ instead — so the gap widens as the gift gets bigger.</p>
              </div>
            </ScrollFade>
            <div className="grid sm:grid-cols-3 gap-6">
              <ScrollFade delay={0}>
                <div className="bg-white rounded-3xl border border-wgc-navy-100 p-8 text-center shadow-sm">
                  <div className="text-[10px] font-black text-wgc-navy-400 uppercase tracking-widest mb-4 font-mono">On a $500 ACH gift</div>
                  <div className="text-4xl font-bold text-wgc-navy-950 tracking-tighter mb-2">25¢</div>
                  <p className="text-[13px] font-medium text-wgc-navy-500">vs. $5–$5.45 on a 1%-plus-fee platform</p>
                </div>
              </ScrollFade>
              <ScrollFade delay={100}>
                <div className="bg-white rounded-3xl border border-wgc-navy-100 p-8 text-center shadow-sm">
                  <div className="text-[10px] font-black text-wgc-navy-400 uppercase tracking-widest mb-4 font-mono">On a $2,500 ACH gift</div>
                  <div className="text-4xl font-bold text-wgc-navy-950 tracking-tighter mb-2">25¢</div>
                  <p className="text-[13px] font-medium text-wgc-navy-500">vs. $25–$25.45 on a 1%-plus-fee platform</p>
                </div>
              </ScrollFade>
              <ScrollFade delay={200}>
                <div className="bg-wgc-navy-950 rounded-3xl p-8 text-center shadow-sm">
                  <div className="text-[10px] font-black text-wgc-gold-500 uppercase tracking-widest mb-4 font-mono">On a $10,000 ACH gift</div>
                  <div className="text-4xl font-bold !text-white tracking-tighter mb-2">25¢</div>
                  <p className="text-[13px] font-medium text-white/60">vs. $100–$100.45 on a 1%-plus-fee platform</p>
                </div>
              </ScrollFade>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-24 bg-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <ScrollFade>
              <div className="text-center mb-16">
                <h2 className="text-3xl font-bold text-wgc-navy-950 tracking-tight mb-4">Comparison, answered</h2>
              </div>
              <div className="space-y-8">
                {FAQS.map((faq) => (
                  <div key={faq.question} className="bg-wgc-off p-8 rounded-3xl border border-wgc-navy-100">
                    <h3 className="text-xl font-bold text-wgc-navy-950 mb-3">{faq.question}</h3>
                    <p className="text-wgc-navy-500 leading-relaxed font-medium">{faq.answer}</p>
                  </div>
                ))}
              </div>
            </ScrollFade>
          </div>
        </section>

        <CTASection
          headline="See the difference on your own volume"
          subheadline="Run your current giving numbers through our calculator, or talk to us directly about switching."
          ctaText="Calculate Your Savings"
          ctaLink="/pricing#calculator"
        />
      </main>
      <Footer />
    </>
  );
}
