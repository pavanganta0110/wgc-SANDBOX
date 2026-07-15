import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import PricingCalculator from "@/components/pricing/PricingCalculator";
import CTASection from "@/components/ui/CTASection";
import ScrollFade from "@/components/ui/ScrollFade";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing | Transparent Church & Nonprofit Payment Rates",
  description: "Clear, competitive payment pricing built for ministries, including low flat-rate ACH. No hidden fees — see how WGC saves partners 15–20%.",
  openGraph: {
    title: "Pricing | Transparent Church & Nonprofit Payment Rates",
    description: "Clear, competitive payment pricing built for ministries, including low flat-rate ACH. No hidden fees — see how WGC saves partners 15–20%.",
    url: "https://www.wgcpayments.com/pricing",
  },
};


const INCLUDED_ITEMS = [
  "Donation processing",
  "Recurring giving pipelines",
  "Low-cost ACH processing",
  "Automated bank payouts",
  "Real-time transaction reporting",
  "Partner-ready platform infrastructure",
];

const TARGET_GROUPS = [
  "Churches of all sizes",
  "Global faith networks",
  "Nonprofit organizations",
  "Software platforms serving ministries",
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
                  <span className="text-[10px] font-black uppercase tracking-[0.4em] text-wgc-navy-950 font-mono">Transparent Stewardship</span>
                </div>
                <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.05] mb-8 text-wgc-navy-950">
                  Transparent, <span className="text-wgc-gold-600 italic">competitive</span> rates.
                </h1>
                <p className="text-lg sm:text-xl font-medium leading-relaxed mb-12 text-wgc-navy-500 max-w-2xl tracking-tight opacity-80">
                  WGC offers highly competitive pricing for churches and nonprofits. Flat-rate ACH and a simple platform fee — so you can fund the mission, not the bank.
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
                    <img 
                      src="/images/pricing.png" 
                      alt="Financial Stewardship Report"
                      className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105 brightness-[1.02]"
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-wgc-navy-950/90 backdrop-blur-md p-10 border-t border-white/10">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-8 h-px bg-wgc-gold-500"></div>
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-wgc-gold-500 font-mono">Ministry Trust</span>
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
 
        {/* PRICING TIERS */}
        <section className="py-32 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <ScrollFade>
              <div className="grid lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
                {/* Card Processing */}
                <div className="bg-white rounded-[2.5rem] border border-wgc-navy-100 p-12 relative overflow-hidden group hover:shadow-2xl hover:-translate-y-2 transition-all duration-500">
                  <div className="text-[10px] font-black text-wgc-gold-600 uppercase tracking-[0.3em] mb-8 font-mono">Standard Processing</div>
                  <h3 className="text-2xl font-bold text-wgc-navy-900 mb-4 tracking-tight">Card processing</h3>
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-6xl font-bold text-wgc-navy-950 tracking-tighter">2.3%</span>
                    <span className="text-2xl font-bold text-wgc-navy-400">+ $0.25</span>
                  </div>
                  <p className="text-[11px] font-bold text-wgc-navy-400 mb-6 uppercase tracking-widest">Per transaction*</p>
                  
                  <div className="mb-10 bg-wgc-navy-50/50 p-4 rounded-xl border border-wgc-navy-100/50">
                    <p className="text-[12px] font-medium text-wgc-navy-600 leading-relaxed italic">
                      *This is the highest possible rate. As volume and processing efficiency increase, pricing is reduced — never increased.
                    </p>
                  </div>
                  <div className="w-12 h-1 bg-wgc-gold-500 rounded-full group-hover:w-full transition-all duration-700"></div>
                </div>
 
                {/* ACH */}
                <div className="bg-white rounded-[2.5rem] border border-wgc-navy-100 p-12 relative overflow-hidden group hover:shadow-2xl hover:-translate-y-2 transition-all duration-500">
                  <div className="text-[10px] font-black text-wgc-navy-400 uppercase tracking-[0.3em] mb-8 font-mono">Optimized Choice</div>
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
                  <div className="text-[10px] font-black text-wgc-gold-500 uppercase tracking-[0.3em] mb-8 font-mono">Infrastructure</div>
                  <h3 className="text-2xl font-bold !text-white mb-4 tracking-tight">Base protocol</h3>
                  <p className="text-sm font-medium text-white/50 mb-10 leading-relaxed">Predictable monthly platform fee per church account.</p>
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-6xl font-bold text-white tracking-tighter">$10</span>
                    <span className="text-2xl font-bold text-white/30">/mo</span>
                  </div>
                  <p className="text-[11px] font-bold text-wgc-gold-500/60 mb-10 uppercase tracking-widest">Per active merchant</p>
                  <div className="w-12 h-1 bg-wgc-gold-500 rounded-full group-hover:w-full transition-all duration-700"></div>
                </div>
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
                  <span className="text-[10px] font-black uppercase tracking-[0.4em] text-wgc-navy-950 font-mono">The Stewardship Ledger</span>
                </div>
                <h2 className="text-4xl font-bold text-wgc-navy-900 mb-8 tracking-tight">How we save you <span className="text-wgc-gold-600">15-20%</span></h2>
                <div className="space-y-10 mb-12">
                  <div className="flex items-start gap-6">
                    <div className="w-12 h-12 rounded-2xl bg-white border border-wgc-navy-100 flex items-center justify-center shrink-0 shadow-sm">
                      <CheckCircle2 className="w-6 h-6 text-wgc-gold-600" />
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-wgc-navy-900 mb-2">No percentage gouging on ACH</h4>
                      <p className="text-[15px] font-medium text-wgc-navy-500 leading-relaxed opacity-80">While others take 1% or more on large donations, we charge a flat 25¢. On a $1,000 donation, you keep $9.75 more with WGC.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-6">
                    <div className="w-12 h-12 rounded-2xl bg-white border border-wgc-navy-100 flex items-center justify-center shrink-0 shadow-sm">
                      <CheckCircle2 className="w-6 h-6 text-wgc-gold-600" />
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-wgc-navy-900 mb-2">Capped card processing rates</h4>
                      <p className="text-[15px] font-medium text-wgc-navy-500 leading-relaxed opacity-80">We utilize ministry-grade rails to cap our card fees, ensuring your larger ministry gifts aren&apos;t drained by standard retail margins.</p>
                    </div>
                  </div>
                </div>
              </ScrollFade>

              <ScrollFade delay={200}>
                <div className="bg-wgc-navy-950 rounded-[3rem] p-12 shadow-2xl relative overflow-hidden border border-white/10">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-wgc-gold-500/10 blur-[100px] pointer-events-none"></div>
                  <h3 className="text-2xl font-black !text-white mb-10 tracking-tight">The impact of stewardship</h3>
                  <div className="space-y-8">
                    <div className="flex justify-between items-end pb-8 border-b border-white/10">
                      <div>
                        <div className="text-[10px] font-black text-white/70 uppercase tracking-widest mb-2 font-mono">Annual Donation Volume</div>
                        <div className="text-3xl font-bold text-white tracking-tighter">$1.2M</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] font-black text-wgc-gold-500 uppercase tracking-widest mb-2 font-mono">WGC Annual Savings</div>
                        <div className="text-4xl font-bold text-wgc-gold-500 tracking-tighter">+$18,400</div>
                      </div>
                    </div>
                    <p className="text-sm font-medium text-white/80 leading-relaxed italic opacity-90">
                      &quot;That $18,400 represents a year of community outreach, food for the hungry, or the salary of a part-time youth leader. Every dollar matters.&quot;
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
                <p className="text-lg text-wgc-navy-500 leading-relaxed font-medium tracking-tight opacity-90">Compare your current processor&apos;s rates with WGC&apos;s mission-aligned model in real time.</p>
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
                <h3 className="text-xl font-bold text-wgc-navy-900 mb-6 tracking-tight underline underline-offset-8 decoration-wgc-gold-500 decoration-2">Why ministries save</h3>
                <p className="text-[15px] font-medium text-wgc-navy-500 leading-relaxed mb-6 tracking-tight opacity-80">
                  WGC is purpose-built for recurring giving and donation workflows. We don&apos;t have the overhead of retail processors or the margins of Silicon Valley.
                </p>
                <p className="text-[15px] font-medium text-wgc-navy-500 leading-relaxed tracking-tight opacity-80">
                  By pairing a predictable monthly platform fee with transparent rates and robust ACH support, churches can finally stop losing ground to transaction friction.
                </p>
              </ScrollFade>
 
              {/* Section C */}
              <ScrollFade delay={300}>
                <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-wgc-navy-50 text-wgc-gold-600 text-[9px] font-bold tracking-[0.2em] uppercase mb-8 border border-wgc-navy-100 font-mono">Built For</div>
                <h3 className="text-xl font-bold text-wgc-navy-900 mb-6 tracking-tight underline underline-offset-8 decoration-wgc-gold-500 decoration-2">Who this is for</h3>
                <p className="text-[15px] font-medium text-wgc-navy-500 leading-relaxed mb-8 tracking-tight opacity-80">
                  WGC provides ministry donation costs for specific ecosystem partners:
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
          headline="Ready to save for the Kingdom?"
          subheadline="Talk to us about your current processing setup and let us build a roadmap for your transition."
          ctaText="Request Pricing Review"
          ctaLink="/contact"
        />
      </main>
      <Footer />
    </>
  );
}
