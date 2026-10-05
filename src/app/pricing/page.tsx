import Link from "next/link";
import Image from "next/image";
import { CheckCircle2 } from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import PricingCalculator from "@/components/pricing/PricingCalculator";
import CTASection from "@/components/ui/CTASection";
import ScrollFade from "@/components/ui/ScrollFade";

import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "/pricing" },
  title: "Pricing | $0 Processing Cost When Supporters Cover the Fee",
  description: "$0 processing cost to your organization when supporters cover the fee. A simple $10/month platform fee includes supporter management, recurring giving, reporting, settlements, refunds, statements, and team accounts.",
  openGraph: {
    images: [{ url: "/og/pricing.png", width: 1200, height: 630 }],
    title: "Pricing | $0 Processing Cost When Supporters Cover the Fee",
    description: "$0 processing cost to your organization when supporters cover the fee. The $10/month platform fee includes the full WGC dashboard.",
    url: "https://www.wgcpayments.com/pricing",
  },
};


const INCLUDED_ITEMS = [
  "One-time & recurring payments",
  "Card, ACH, Apple Pay & Google Pay",
  "Donor profiles & donation history",
  "External & offline donation recording",
  "Giving & campaign pages",
  "Email giving campaigns",
  "Invoicing & payment requests",
  "Reporting & donor analytics with CSV exports",
  "Settlements & payouts",
  "Refunds & disputes",
  "Year-end statements",
  "Team accounts (Owner, Admin, Fundraiser, Viewer)",
  "Role-based permissions",
  "QuickBooks & Aplos integration",
];

const TARGET_GROUPS = [
  "Nonprofits & charities",
  "Churches & ministries",
  "Foundations",
  "Associations & membership organizations",
  "Schools, PTAs & booster clubs",
  "Community organizations",
];

export default function PricingPage() {
  return (
    <>
      <Header />
      <main className="flex-grow">
        {/* MINISTRY HERO */}
        <section className="relative bg-white pt-40 pb-24 overflow-hidden border-b border-wgc-navy-50">
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none">
            <svg className="w-full h-full" fill="none">
              <pattern id="pricing-hero-grid" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-wgc-navy-950" />
              </pattern>
              <rect width="100%" height="100%" fill="url(#pricing-hero-grid)" />
            </svg>
          </div>
 
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <div className="grid lg:grid-cols-12 gap-12 lg:gap-20 items-center">
              <ScrollFade className="lg:col-span-7 text-left">
                <div className="inline-flex items-center gap-2 px-5 py-2 rounded-xl mb-10 border border-wgc-navy-100 bg-wgc-navy-50">
                  <div className="w-1.5 h-1.5 rounded-full bg-wgc-gold-600"></div>
                  <span className="text-[10px] font-black uppercase tracking-[0.4em] text-wgc-navy-950 font-mono">Mission Focused Pricing</span>
                </div>
                <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.05] mb-8 text-wgc-navy-950">
                  <span className="text-wgc-gold-600 italic">$0</span> processing cost to your organization.
                </h1>
                <p className="text-lg sm:text-xl font-medium leading-relaxed mb-4 text-wgc-navy-500 max-w-2xl tracking-tight opacity-80">
                  By default supporters have the opportunity to cover the fees so more of every gift goes straight to your mission at no cost to your organization. Prefer your organization to absorb the fee instead? We show that rate too, clearly, below.
                </p>
                <p className="text-lg sm:text-xl font-medium leading-relaxed mb-12 text-wgc-navy-500 max-w-2xl tracking-tight opacity-80">
                  The $10/month WGC platform fee isn&apos;t just for processing — it includes supporter management, recurring giving, reporting, settlements, refunds, statements, and team accounts.
                </p>
                <div className="flex flex-col sm:flex-row gap-6">
                  <a href="#calculator" className="bg-wgc-gold-500 text-wgc-navy-950 inline-flex items-center justify-center px-10 py-5 text-[13px] font-bold rounded-2xl shadow-[0_20px_40px_rgba(234,179,8,0.2)] transform transition-all hover:scale-105 hover:bg-wgc-navy-950 hover:text-white uppercase tracking-widest">
                    Calculate Savings
                  </a>
                  <Link href="/contact" className="inline-flex items-center justify-center px-10 py-5 text-[13px] font-bold rounded-2xl transition-all border border-wgc-navy-200 text-wgc-navy-600 hover:bg-wgc-navy-50 uppercase tracking-widest">
                    Talk to Sales
                  </Link>
                </div>
              </ScrollFade>

              <ScrollFade delay={200} className="lg:col-span-5">
                <div className="relative group">
                  <div className="relative rounded-[3rem] overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.15)] border border-wgc-navy-100 aspect-[4/5] lg:aspect-auto lg:h-[600px]">
                    <Image
                      src="/images/pricing.webp"
                      alt="Financial Stewardship Report"
                      fill
                      sizes="(max-width: 1024px) 100vw, 45vw"
                      className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105 brightness-[1.02]"
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-wgc-navy-950/90 backdrop-blur-md p-10 border-t border-white/10">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-8 h-px bg-wgc-gold-500"></div>
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-wgc-gold-500 font-mono">Full Transparency</span>
                      </div>
                      <p className="text-lg font-bold leading-snug italic text-white tracking-tight">
                        &quot;Trust is built on transparency and stewardship of every dollar.&quot;
                      </p>
                    </div>
                  </div>
                </div>
              </ScrollFade>
            </div>
          </div>
        </section>

        {/* DONOR-COVERS-FEE HIGHLIGHT */}
        <section className="py-20 bg-wgc-navy-950">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <ScrollFade>
              <div className="rounded-[3rem] bg-wgc-grad-navy border border-wgc-gold-500/20 p-12 md:p-16 text-center shadow-2xl">
                <div className="text-[10px] font-black text-wgc-gold-500 uppercase tracking-[0.4em] mb-6 font-mono">The Default Option</div>
                <div className="text-6xl md:text-8xl font-black !text-white tracking-tighter mb-4">$0</div>
                <h2 className="text-2xl md:text-3xl font-bold !text-white mb-6 tracking-tight">Processing cost to your organization — when the supporter covers the fee</h2>
                <p className="text-white/70 max-w-2xl mx-auto leading-relaxed">
                  Most supporters are happy to cover the small processing fee so 100% of their intended gift reaches your organization. Prefer your organization to absorb it instead? See that rate below — it&apos;s just as transparent.
                </p>
              </div>
            </ScrollFade>
          </div>
        </section>

        {/* PRICING TIERS */}
        <section className="py-32 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <ScrollFade>
              <div className="text-center max-w-2xl mx-auto mb-16">
                <h2 className="text-2xl font-bold text-wgc-navy-900 tracking-tight mb-3">If your organization covers the fee</h2>
                <p className="text-wgc-navy-500">The same transparent rates, shown plainly — no hidden markups.</p>
              </div>
              <div className="grid lg:grid-cols-2 xl:grid-cols-4 gap-8 max-w-7xl mx-auto">
                {/* Card Processing */}
                <div className="bg-white rounded-[2.5rem] border border-wgc-navy-100 p-12 relative overflow-hidden group hover:shadow-2xl hover:-translate-y-2 transition-all duration-500">
                  <div className="text-[10px] font-black text-wgc-gold-600 uppercase tracking-[0.3em] mb-8 font-mono">Organization-Paid</div>
                  <h3 className="text-2xl font-bold text-wgc-navy-900 mb-4 tracking-tight">Card processing</h3>
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-6xl font-bold text-wgc-navy-950 tracking-tighter">2.3%</span>
                    <span className="text-2xl font-bold text-wgc-navy-400">+ $0.25</span>
                  </div>
                  <p className="text-[11px] font-bold text-wgc-navy-400 mb-10 uppercase tracking-widest">Per transaction, capped</p>
                  <div className="w-12 h-1 bg-wgc-gold-500 rounded-full group-hover:w-full transition-all duration-700"></div>
                </div>

                {/* ACH */}
                <div className="bg-white rounded-[2.5rem] border border-wgc-navy-100 p-12 relative overflow-hidden group hover:shadow-2xl hover:-translate-y-2 transition-all duration-500">
                  <div className="text-[10px] font-black text-wgc-navy-400 uppercase tracking-[0.3em] mb-8 font-mono">Organization-Paid</div>
                  <h3 className="text-2xl font-bold text-wgc-navy-900 mb-4 tracking-tight">ACH / eCheck</h3>
                  <p className="text-sm font-medium text-wgc-navy-500 mb-10 leading-relaxed opacity-70">Lower-cost option for recurring and large donations.</p>
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-6xl font-bold text-wgc-navy-950 tracking-tighter">25¢</span>
                  </div>
                  <p className="text-[11px] font-bold text-wgc-navy-400 mb-10 uppercase tracking-widest">Flat rate per transfer</p>
                  <div className="w-12 h-1 bg-wgc-navy-900 rounded-full group-hover:w-full transition-all duration-700"></div>
                </div>

                {/* Platform Fee */}
                <div className="bg-wgc-navy-950 text-white rounded-[2.5rem] shadow-2xl p-12 relative overflow-hidden group hover:-translate-y-2 transition-all duration-500">
                  <div className="text-[10px] font-black text-wgc-gold-500 uppercase tracking-[0.3em] mb-8 font-mono">WGC Platform Fee</div>
                  <h3 className="text-2xl font-bold !text-white mb-4 tracking-tight">Full platform access</h3>
                  <p className="text-sm font-medium text-white/50 mb-6 leading-relaxed">Not a processing add-on — this is what unlocks the entire WGC dashboard: donors, recurring giving, reporting, settlements, refunds, statements, and team accounts.</p>
                  <p className="text-sm font-bold text-wgc-gold-500/80 mb-10 leading-relaxed">Simple, flat, and predictable — no percentage-based WGC platform fee.</p>
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-6xl font-bold text-white tracking-tighter">$10</span>
                    <span className="text-2xl font-bold text-white/30">/mo</span>
                  </div>
                  <p className="text-[11px] font-bold text-wgc-gold-500/60 mb-10 uppercase tracking-widest">Per organization</p>
                  <div className="w-12 h-1 bg-wgc-gold-500 rounded-full group-hover:w-full transition-all duration-700"></div>
                </div>

                {/* Recurring Giving */}
                <div className="bg-white rounded-[2.5rem] border border-wgc-navy-100 p-12 relative overflow-hidden group hover:shadow-2xl hover:-translate-y-2 transition-all duration-500">
                  <div className="text-[10px] font-black text-wgc-navy-400 uppercase tracking-[0.3em] mb-8 font-mono">At Cost</div>
                  <h3 className="text-2xl font-bold text-wgc-navy-900 mb-4 tracking-tight">Recurring giving</h3>
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-6xl font-bold text-wgc-navy-950 tracking-tighter">0.1%</span>
                  </div>
                  <p className="text-[11px] font-bold text-wgc-navy-400 mb-10 uppercase tracking-widest">Added per recurring charge</p>
                  <div className="w-12 h-1 bg-wgc-navy-900 rounded-full group-hover:w-full transition-all duration-700"></div>
                </div>
              </div>
            </ScrollFade>
            <ScrollFade>
              <div className="mt-10 max-w-3xl mx-auto text-center p-8 rounded-3xl bg-wgc-gold-500/5 border border-wgc-gold-500/20">
                <p className="text-wgc-navy-700 font-medium leading-relaxed">
                  New to WGC? You may qualify for a limited-time <span className="font-bold text-wgc-navy-900">90-day free trial</span> before the $10/month platform fee begins.{" "}
                  <Link href="/90-days-free" className="text-wgc-gold-600 font-bold hover:underline">See if you qualify</Link>.
                </p>
              </div>
            </ScrollFade>
          </div>
        </section>

        {/* STEWARDSHIP LEDGER */}
        <section className="py-24 bg-wgc-off border-y border-wgc-navy-100/10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="lg:grid lg:grid-cols-2 lg:gap-20 items-center">
              <ScrollFade>
                <div className="inline-flex items-center gap-3 px-5 py-2 rounded-xl mb-10 border border-wgc-navy-200 bg-white">
                  <div className="w-2 h-2 rounded-full bg-wgc-gold-600"></div>
                  <span className="text-[10px] font-black uppercase tracking-[0.4em] text-wgc-navy-950 font-mono">Money & Time Saved</span>
                </div>
                <h2 className="text-4xl font-bold text-wgc-navy-900 mb-8 tracking-tight">How we save you <span className="text-wgc-gold-600">money and hours</span></h2>
                <div className="space-y-10 mb-12">
                  <div className="flex items-start gap-6">
                    <div className="w-12 h-12 rounded-2xl bg-white border border-wgc-navy-100 flex items-center justify-center shrink-0 shadow-sm">
                      <CheckCircle2 className="w-6 h-6 text-wgc-gold-600" />
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-wgc-navy-900 mb-2">No percentage fees on ACH</h4>
                      <p className="text-[15px] font-medium text-wgc-navy-500 leading-relaxed opacity-80">While others take 1% or more on large transactions, we charge a flat 25¢. On a $1,000 gift or payment, you keep $9.75 more with WGC.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-6">
                    <div className="w-12 h-12 rounded-2xl bg-white border border-wgc-navy-100 flex items-center justify-center shrink-0 shadow-sm">
                      <CheckCircle2 className="w-6 h-6 text-wgc-gold-600" />
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-wgc-navy-900 mb-2">Capped card processing rates</h4>
                      <p className="text-[15px] font-medium text-wgc-navy-500 leading-relaxed opacity-80">We cap our card fees so larger gifts to your organization aren&apos;t drained by standard retail margins.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-6">
                    <div className="w-12 h-12 rounded-2xl bg-white border border-wgc-navy-100 flex items-center justify-center shrink-0 shadow-sm">
                      <CheckCircle2 className="w-6 h-6 text-wgc-gold-600" />
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-wgc-navy-900 mb-2">One platform fee, not five subscriptions</h4>
                      <p className="text-[15px] font-medium text-wgc-navy-500 leading-relaxed opacity-80">Supporter management, recurring giving, reporting, and team accounts are included in the $10/month platform fee — no separate tools to buy or staff hours spent connecting them.</p>
                    </div>
                  </div>
                </div>
              </ScrollFade>

              <ScrollFade delay={200}>
                <div className="bg-wgc-navy-950 rounded-[3rem] p-12 shadow-2xl relative overflow-hidden border border-white/10">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-wgc-gold-500/10 blur-[100px] pointer-events-none"></div>
                  <h3 className="text-2xl font-black !text-white mb-10 tracking-tight">The impact of every dollar saved</h3>
                  <div className="space-y-8">
                    <div className="flex justify-between items-end pb-8 border-b border-white/10">
                      <div>
                        <div className="text-[10px] font-black text-white/70 uppercase tracking-widest mb-2 font-mono">Annual Payment Volume</div>
                        <div className="text-3xl font-bold text-white tracking-tighter">$1.2M</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] font-black text-wgc-gold-500 uppercase tracking-widest mb-2 font-mono">WGC Annual Savings</div>
                        <div className="text-4xl font-bold text-wgc-gold-500 tracking-tighter">+$18,400</div>
                      </div>
                    </div>
                    <p className="text-sm font-medium text-white/80 leading-relaxed italic opacity-90">
                      &quot;That $18,400 represents a year of community outreach, program funding, or the salary of a part-time staff member. Every dollar matters — and so does every hour your team gets back.&quot;
                    </p>
                  </div>
                </div>
              </ScrollFade>
            </div>
          </div>
        </section>
 
        {/* CALCULATOR SECTION */}
        <section id="calculator" className="py-24 bg-white border-b border-wgc-navy-100">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <ScrollFade>
              <div className="text-center max-w-3xl mx-auto mb-16">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-wgc-navy-50 text-wgc-navy-600 text-[10px] font-bold tracking-[0.2em] uppercase mb-6 border border-wgc-navy-100 font-mono">Savings Calculator</div>
                <h2 className="text-4xl font-bold text-wgc-navy-900 mb-6 tracking-tight">Calculate your potential impact</h2>
                <p className="text-lg text-wgc-navy-500 leading-relaxed font-medium tracking-tight opacity-90">Compare your current processor&apos;s rates with WGC&apos;s pricing in real time.</p>
              </div>
              <PricingCalculator />
            </ScrollFade>
          </div>
        </section>

        {/* FEATURES GRID */}
        <section className="py-24 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid md:grid-cols-3 gap-12 lg:gap-16">
              {/* Section A */}
              <ScrollFade delay={0}>
                <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-wgc-navy-50 text-wgc-gold-600 text-[9px] font-bold tracking-[0.2em] uppercase mb-8 border border-wgc-navy-100 font-mono">Included Core</div>
                <h3 className="text-xl font-bold text-wgc-navy-900 mb-6 tracking-tight underline underline-offset-8 decoration-wgc-gold-500 decoration-2">What&apos;s included</h3>
                <ul className="space-y-5">
                  {INCLUDED_ITEMS.map((item) => (
                    <li key={item} className="flex items-start group">
                      <div className="w-5 h-5 rounded-full bg-wgc-gold-500/10 border border-wgc-gold-500/30 flex items-center justify-center mr-4 mt-0.5 group-hover:scale-110 transition-all">
                        <CheckCircle2 className="w-3 h-3 text-wgc-gold-500" />
                      </div>
                      <span className="text-[15px] font-medium text-wgc-navy-700 leading-snug tracking-tight">{item}</span>
                    </li>
                  ))}
                </ul>
              </ScrollFade>
 
              {/* Section B */}
              <ScrollFade delay={150}>
                <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-wgc-navy-50 text-wgc-gold-600 text-[9px] font-bold tracking-[0.2em] uppercase mb-8 border border-wgc-navy-100 font-mono">Mission Focused</div>
                <h3 className="text-xl font-bold text-wgc-navy-900 mb-6 tracking-tight underline underline-offset-8 decoration-wgc-gold-500 decoration-2">Why organizations save</h3>
                <p className="text-[15px] font-medium text-wgc-navy-500 leading-relaxed mb-6 tracking-tight opacity-80">
                  WGC is purpose-built for mission-driven organizations — not retrofitted from generic retail checkout software, and not priced like Silicon Valley overhead.
                </p>
                <p className="text-[15px] font-medium text-wgc-navy-500 leading-relaxed tracking-tight opacity-80">
                  A predictable monthly platform fee replaces the cost and hassle of separate donor, giving, reporting, and accounting tools — so your team spends less time on administration and more on the mission.
                </p>
              </ScrollFade>

              {/* Section C */}
              <ScrollFade delay={300}>
                <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-wgc-navy-50 text-wgc-gold-600 text-[9px] font-bold tracking-[0.2em] uppercase mb-8 border border-wgc-navy-100 font-mono">Built For</div>
                <h3 className="text-xl font-bold text-wgc-navy-900 mb-6 tracking-tight underline underline-offset-8 decoration-wgc-gold-500 decoration-2">Who this is for</h3>
                <p className="text-[15px] font-medium text-wgc-navy-500 leading-relaxed mb-8 tracking-tight opacity-80">
                  WGC is built for organizations that manage giving directly:
                </p>
                <div className="space-y-4">
                  {TARGET_GROUPS.map((group) => (
                    <div key={group} className="flex items-center gap-4 text-[15px] font-medium text-wgc-navy-900 tracking-tight">
                      <div className="w-2 h-2 rounded-full bg-wgc-gold-500 shadow-sm shadow-wgc-gold-500/50"></div>
                      <span>{group}</span>
                    </div>
                  ))}
                </div>
              </ScrollFade>
            </div>
          </div>
        </section>
 
        {/* CTA */}
        <CTASection
          headline="Ready to save time and put more toward the mission?"
          subheadline="Talk to us about your current processing setup and let us build a roadmap for your transition."
          ctaText="Request Pricing Review"
          ctaLink="/contact"
        />
      </main>
      <Footer />
    </>
  );
}
