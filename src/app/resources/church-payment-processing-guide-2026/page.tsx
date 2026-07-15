import Link from "next/link";
import { ChevronLeft, CheckCircle2, ShieldCheck, CreditCard, Landmark, TrendingUp } from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ResourceCTA from "@/components/resources/ResourceCTA";
import ScrollFade from "@/components/ui/ScrollFade";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Best Payment Processor for Churches in 2026 | WGC",
  description: "A practical guide to choosing a church payment processor in 2026 — fees, ACH, white-label options, and what to look for when comparing providers.",
  openGraph: {
    title: "Best Payment Processor for Churches in 2026 | WGC",
    description: "A practical guide to choosing a church payment processor in 2026 — fees, ACH, white-label options, and what to look for when comparing providers.",
    url: "https://www.wgcpayments.com/resources/church-payment-processing-guide-2026",
  },
};


const PILLARS = [
  'Card payment support',
  'ACH / bank transfer support',
  'Recurring donation options',
  'Donation form experience',
  'Branded donation page',
  'Payout visibility',
  'Reporting & transaction history',
  'Ease of setup'
];

export default function ChurchPaymentGuidePage() {
  return (
    <>
      <Header />
      <main className="min-h-screen bg-white selection:bg-wgc-gold-100 selection:text-wgc-navy-900">
        {/* Top Navigation */}
        <nav className="sticky top-[72px] z-40 bg-white/80 backdrop-blur-md border-b border-wgc-navy-50 py-4 lg:py-6">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center">
            <Link href="/resources" className="group flex items-center gap-2 text-[10px] font-bold text-wgc-navy-400 hover:text-black uppercase tracking-[0.2em] transition-all font-mono">
              <ChevronLeft className="w-3 h-3 group-hover:-translate-x-1 transition-transform" />
              Back to Resources
            </Link>
            <div className="hidden md:flex items-center gap-2">
               <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
               <span className="text-[9px] font-bold text-wgc-navy-400 uppercase tracking-widest font-mono">WGC Research Center</span>
            </div>
          </div>
        </nav>

        {/* Article Hero */}
        <header className="pt-16 pb-12 bg-white border-b border-wgc-navy-50">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <ScrollFade>
              <div className="flex items-center gap-2 text-wgc-gold-600 font-bold text-[10px] uppercase tracking-[0.3em] mb-6 font-mono">
                <div className="w-8 h-px bg-wgc-gold-500"></div>
                Featured Guide
              </div>
              <h1 className="text-4xl md:text-5xl font-bold text-wgc-navy-900 tracking-tighter mb-8 tracking-tight uppercase leading-[1.05]">
                Best Payment Processor <span className="text-wgc-gold-500">For Churches in 2026</span>
              </h1>
              <p className="text-lg md:text-xl text-wgc-navy-600 font-medium leading-relaxed italic border-l-4 border-wgc-gold-500 pl-6 border-opacity-30 opacity-90">
                Churches need more than a way to accept donations online. A modern payment setup should support card payments, ACH transfers, recurring giving, branded donation experiences, payout visibility, and simple reporting.
              </p>
            </ScrollFade>
          </div>
        </header>

        {/* Main Content */}
        <article className="py-20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="prose prose-lg max-w-none text-wgc-navy-900 font-medium space-y-16">
              
              <ScrollFade>
                <section>
                  <div className="flex items-center gap-4 mb-8">
                    <div className="w-1.5 h-8 bg-wgc-gold-500 rounded-full"></div>
                    <h2 className="text-2xl font-bold tracking-tight m-0">What churches should look for in a payment processing solution</h2>
                  </div>
                  <p className="opacity-80 font-medium">In 2026, the right payment system is about reducing friction, increasing trust, and helping organizations manage giving more effectively. Churches should evaluate these core pillars:</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
                    {PILLARS.map((item) => (
                      <div key={item} className="flex items-center gap-3 p-4 bg-wgc-off rounded-2xl border border-wgc-navy-50">
                        <CheckCircle2 className="w-4 h-4 text-wgc-gold-500" />
                        <span className="text-[10px] font-bold text-wgc-navy-900 uppercase tracking-widest font-mono">{item}</span>
                      </div>
                    ))}
                  </div>
                </section>
              </ScrollFade>

              <ScrollFade>
                <section>
                  <div className="flex items-center gap-4 mb-8">
                    <div className="w-1.5 h-8 bg-wgc-gold-500 rounded-full"></div>
                    <h2 className="text-2xl font-bold tracking-tight m-0">Card payments, ACH transfers, and recurring giving</h2>
                  </div>
                  <div className="space-y-6">
                    <div className="p-8 bg-white border border-wgc-navy-100 rounded-[2rem] shadow-sm flex items-start gap-6 group hover:border-wgc-gold-300 transition-all">
                      <div className="w-12 h-12 rounded-2xl bg-wgc-gold-50 border border-wgc-gold-100 flex items-center justify-center text-wgc-gold-600 group-hover:bg-wgc-gold-500 group-hover:text-wgc-navy-900 transition-colors">
                        <CreditCard className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-wgc-navy-900 uppercase tracking-widest mb-2 font-mono">Card Performance</h3>
                        <p className="text-sm text-wgc-navy-500 font-medium opacity-80">Card payments remain essential for immediate convenience and high adoption rates among new donors.</p>
                      </div>
                    </div>
                    <div className="p-8 bg-white border border-wgc-navy-100 rounded-[2rem] shadow-sm flex items-start gap-6 group hover:border-wgc-gold-300 transition-all">
                       <div className="w-12 h-12 rounded-2xl bg-wgc-gold-50 border border-wgc-gold-100 flex items-center justify-center text-wgc-gold-600 group-hover:bg-wgc-gold-500 group-hover:text-wgc-navy-900 transition-colors">
                         <Landmark className="w-6 h-6" />
                       </div>
                       <div>
                         <h3 className="text-sm font-bold text-wgc-navy-900 uppercase tracking-widest mb-2 font-mono">ACH Protocol</h3>
                         <p className="text-sm text-wgc-navy-500 font-medium opacity-80">ACH transfers provide a lower-cost alternative for significant recurring gifts, preserving more for mission-aligned work.</p>
                       </div>
                     </div>
                     <div className="p-8 bg-white border border-wgc-navy-100 rounded-[2rem] shadow-sm flex items-start gap-6 group hover:border-wgc-gold-300 transition-all">
                        <div className="w-12 h-12 rounded-2xl bg-wgc-gold-50 border border-wgc-gold-100 flex items-center justify-center text-wgc-gold-600 group-hover:bg-wgc-gold-500 group-hover:text-wgc-navy-900 transition-colors">
                          <TrendingUp className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-wgc-navy-900 uppercase tracking-widest mb-2 font-mono">Predictable Stewardship</h3>
                          <p className="text-sm text-wgc-navy-500 font-medium opacity-80">Recurring giving creates predictable donation flows and reduces the administrative burden of manual follow-up.</p>
                        </div>
                      </div>
                  </div>
                </section>
              </ScrollFade>

              <ScrollFade>
                <section>
                  <div className="flex items-center gap-4 mb-8">
                    <div className="w-1.5 h-8 bg-wgc-gold-500 rounded-full"></div>
                    <h2 className="text-2xl font-bold tracking-tight m-0">Why a branded donation page matters</h2>
                  </div>
                  <p className="opacity-80 font-medium leading-relaxed">A consistent branded giving experience builds trust. When a donor never leaves your ecosystem to complete a transaction, donor abandonment rates drop significantly. Embedded payment forms reduce technical friction and keep the payment journey focused on the organization&apos;s mission.</p>
                </section>
              </ScrollFade>

              <ScrollFade>
                <section className="bg-wgc-off p-10 rounded-[2.5rem] border border-wgc-navy-100">
                  <div className="flex items-center gap-4 mb-8">
                    <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-wgc-gold-500 border border-gold-500/20">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <h2 className="text-2xl font-bold tracking-tight m-0">Choosing a setup for growth</h2>
                  </div>
                  <p className="mb-0 opacity-80 font-medium leading-relaxed">The best setup supports donor confidence today and ministry scale tomorrow. WGC is designed to power the branded payment experiences and recurring billing visibility required by modern church software environments.</p>
                </section>
              </ScrollFade>

              {/* Internal Linking */}
              <ScrollFade>
                <section className="pt-16 border-t border-wgc-navy-50">
                  <h4 className="text-[10px] font-bold text-wgc-navy-400 uppercase tracking-[0.3em] mb-8 font-mono">Related Resources</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Link href="/resources/white-label-payment-processing-nonprofit-church-software" className="p-6 bg-white border border-wgc-navy-100 rounded-3xl hover:border-wgc-gold-300 transition-all group">
                      <p className="text-xs font-bold text-wgc-navy-900 uppercase tracking-widest mb-2 group-hover:text-wgc-gold-600 transition-colors">White-Label Payment Vertical</p>
                      <p className="text-[10px] text-wgc-navy-400 font-medium opacity-80 leading-relaxed">Explore branded payment architectures for nonprofit software platforms.</p>
                    </Link>
                    <Link href="/resources/church-payment-processing-pricing-guide" className="p-6 bg-white border border-wgc-navy-100 rounded-3xl hover:border-wgc-gold-300 transition-all group">
                      <p className="text-xs font-bold text-wgc-navy-900 uppercase tracking-widest mb-2 group-hover:text-wgc-gold-600 transition-colors">Pricing & Stewardship Guide</p>
                      <p className="text-[10px] text-wgc-navy-400 font-medium opacity-80 leading-relaxed">Understand the WGC pricing structure, card rates, and subscription model.</p>
                    </Link>
                  </div>
                </section>
              </ScrollFade>
            </div>
          </div>
        </article>

        <ResourceCTA />
      </main>
      <Footer />
    </>
  );
}
