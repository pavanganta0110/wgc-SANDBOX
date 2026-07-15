import Link from "next/link";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import CTASection from "@/components/ui/CTASection";
import ScrollFade from "@/components/ui/ScrollFade";
import { Layers, Shield, Landmark } from "lucide-react";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How WGC Works | White-Label Payment Infrastructure",
  description: "See how WGC handles gateway orchestration, settlement, and compliance behind your brand — from donor donation page to payout, fully managed.",
  openGraph: {
    title: "How WGC Works | White-Label Payment Infrastructure",
    description: "See how WGC handles gateway orchestration, settlement, and compliance behind your brand — from donor donation page to payout, fully managed.",
    url: "https://www.wgcpayments.com/how-it-works",
  },
};


const PAYMENT_STEPS = [
  { label: 'Donor initiates a gift', description: 'A donor taps "Give" inside your app. Your software calls the WGC API with the amount, fund, and donor payment method.' },
  { label: 'WGC authenticates the partner request', description: 'The request is validated against your Partner API key. Merchant routing and fee calculations happen in milliseconds.' },
  { label: 'Network processes the payment', description: 'WGC sends the tokenized transaction to the secure core. Card or ACH is authorized through the banking rail with full PCI compliance.' },
  { label: 'WGC fires your webhook', description: 'Your application receives a real-time event notification — payment.succeeded, payment.failed — so your UI updates instantly.' },
  { label: 'Funds settle to the church', description: 'Net proceeds move to the merchant\'s verified bank account. Settlement windows vary by rail — ACH: 1-2 days, Card: 2-3 days.' },
];

export default function HowItWorksPage() {
  return (
    <>
      <Header />
      <main className="flex-grow">
        {/* DARK HERO */}
        <section className="relative bg-wgc-off pt-32 pb-24 overflow-hidden border-b border-wgc-navy-800">
          <div className="absolute inset-0 opacity-[0.04] pointer-events-none">
            <svg className="w-full h-full" fill="none">
              <pattern id="hiw-grid" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
                <path d="M 28 0 L 0 0 0 28" fill="none" stroke="white" strokeWidth="0.5" />
              </pattern>
              <rect width="100%" height="100%" fill="url(#hiw-grid)" />
            </svg>
          </div>
          <div className="absolute top-1/2 right-0 -translate-y-1/2 w-96 h-96 rounded-full blur-3xl opacity-10 pointer-events-none" style={{ background: "radial-gradient(circle, #eab308 0%, transparent 70%)" }}></div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <div className="lg:grid lg:grid-cols-2 lg:gap-16 items-center">
              <ScrollFade>
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-8 border border-wgc-gold-500/30 bg-wgc-gold-500/10 font-mono">
                  <div className="w-1.5 h-1.5 rounded-full bg-wgc-gold-500"></div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-wgc-gold-500/90">Platform Architecture</span>
                </div>
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05] mb-6 text-slate-50">
                  Invisible infrastructure.<br /><span className="text-wgc-gold-500">Powerful results.</span>
                </h1>
                <p className="text-lg font-medium leading-relaxed mb-10 text-wgc-navy-500 tracking-tight">
                  WGC sits directly between your software and the banking system, allowing you to build the ideal giving experience while we handle the complexity of money movement.
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                  <Link href="/contact" className="bg-wgc-gold-500 text-wgc-navy-900 inline-flex items-center justify-center px-8 py-4 text-sm font-bold rounded-full shadow-xl transform transition-all hover:scale-105 uppercase tracking-wider">
                    Contact Sales
                  </Link>
                  <Link href="/software-partners" className="inline-flex items-center justify-center px-8 py-4 text-sm font-bold rounded-full transition-all uppercase tracking-wider border border-slate-700 text-wgc-navy-500 hover:text-wgc-navy-900 hover:border-slate-500">
                    View Partner Plans
                  </Link>
                </div>
              </ScrollFade>
              <ScrollFade delay={200}>
                <div className="mt-16 lg:mt-0">
                  <div className="relative rounded-[2.5rem] p-8 overflow-hidden shadow-2xl border border-wgc-gold-500/20 bg-slate-900 aspect-[4/3] flex flex-col items-center justify-center group">
                     {/* Background Pattern */}
                     <div className="absolute inset-0 opacity-[0.03] pointer-events-none select-none text-[20rem] font-bold text-wgc-gold-500 leading-none">✝</div>
                     
                     {/* Diagram Nodes */}
                     <div className="relative z-10 w-full space-y-8">
                        {/* Partner Node */}
                        <div className="bg-white/5 border border-wgc-navy-100 rounded-2xl p-6 backdrop-blur-sm transform group-hover:translate-x-4 transition-transform duration-700">
                           <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-xl bg-wgc-navy-800 flex items-center justify-center text-wgc-gold-500 border border-wgc-navy-50 shadow-lg">
                                 <Layers className="w-5 h-5" />
                              </div>
                              <div className="text-left">
                                 <div className="text-[10px] font-bold uppercase tracking-widest text-wgc-gold-500 mb-1 font-mono">Layer 01</div>
                                 <div className="text-sm font-bold text-wgc-navy-900 uppercase tracking-tight">Partner Application</div>
                              </div>
                           </div>
                        </div>

                        {/* Connection Line */}
                        <div className="flex justify-center -my-4 animate-pulse">
                           <div className="w-px h-8 bg-gradient-to-b from-wgc-gold-500 to-transparent"></div>
                        </div>

                        {/* WGC Node */}
                        <div className="bg-wgc-gold-500 rounded-2xl p-8 transform group-hover:-translate-x-4 transition-transform duration-700 shadow-[0_0_50px_rgba(234,179,8,0.2)]">
                           <div className="flex items-center gap-5">
                              <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center text-wgc-gold-500 shadow-2xl">
                                 <Shield className="w-6 h-6" />
                              </div>
                              <div className="text-left">
                                 <div className="text-[10px] font-bold uppercase tracking-widest text-wgc-navy-900 mb-1 font-mono opacity-60">The Protocol</div>
                                 <div className="text-lg font-bold text-wgc-navy-900 uppercase tracking-tighter leading-none">WGC Payments <br />Gateway API</div>
                              </div>
                           </div>
                        </div>

                        {/* Connection Line */}
                        <div className="flex justify-center -my-4 animate-pulse">
                           <div className="w-px h-8 bg-gradient-to-b from-wgc-gold-500 to-transparent"></div>
                        </div>

                        {/* Rail Node */}
                        <div className="bg-white/5 border border-wgc-navy-100 rounded-2xl p-6 backdrop-blur-sm transform group-hover:translate-x-4 transition-transform duration-700">
                           <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-xl bg-wgc-navy-800 flex items-center justify-center text-wgc-gold-500 border border-wgc-navy-50 shadow-lg">
                                 <Landmark className="w-5 h-5" />
                              </div>
                              <div className="text-left">
                                 <div className="text-[10px] font-bold uppercase tracking-widest text-wgc-gold-500 mb-1 font-mono">Layer 03</div>
                                 <div className="text-sm font-bold text-wgc-navy-900 uppercase tracking-tight">Financial Core Rails</div>
                              </div>
                           </div>
                        </div>
                     </div>
                  </div>
                </div>
              </ScrollFade>
            </div>
          </div>
        </section>

        {/* ARCHITECTURE STACK */}
        <section className="py-28 bg-white border-b border-wgc-navy-100">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <ScrollFade>
              <div className="text-center mb-20">
                <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-wgc-navy-50 text-wgc-navy-600 text-[10px] font-bold tracking-[0.2em] uppercase mb-6 border border-wgc-navy-100 font-mono">Architecture Stack</div>
                <h2 className="text-4xl sm:text-5xl font-bold text-wgc-navy-900 tracking-tight mb-6">Three-Layer Platform</h2>
                <p className="text-lg text-wgc-navy-500 font-medium max-w-2xl mx-auto tracking-tight opacity-90">The clear separation of concerns in our unified platform infrastructure.</p>
              </div>
            </ScrollFade>

            <div className="space-y-6 text-left">
              <ScrollFade>
                <div className="relative bg-white rounded-3xl p-6 md:p-10 shadow-lg z-30 transform hover:-translate-y-1 transition-all border border-wgc-navy-100">
                  <div className="flex flex-col md:flex-row items-center md:items-start gap-6 text-center md:text-left">
                    <div className="w-16 h-16 bg-wgc-gold-500/10 rounded-2xl flex items-center justify-center text-wgc-gold-500 shadow-sm border border-wgc-gold-500/20 flex-shrink-0">
                      <Layers className="w-7 h-7" />
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-wgc-gold-500 mb-1 font-mono">Layer 1 — Your Platform</div>
                      <h3 className="text-xl font-bold text-wgc-navy-900 tracking-tight mb-1">Partner Software</h3>
                      <p className="text-[15px] font-medium text-wgc-navy-500 leading-relaxed tracking-tight opacity-80">Your ChMS, giving app, or ministry suite. WGC integrates through a clean REST API — completely white-labeled under your brand.</p>
                    </div>
                  </div>
                </div>
              </ScrollFade>

              <div className="flex justify-center"><div className="w-px h-6 bg-wgc-navy-100"></div></div>

              <ScrollFade delay={150}>
                <div className="relative bg-white rounded-3xl p-6 md:p-10 shadow-2xl z-20 transform hover:-translate-y-1 transition-all border border-wgc-gold-500/20">
                  <div className="flex flex-col md:flex-row items-center md:items-start gap-6 text-center md:text-left">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 bg-wgc-gold-500/15 border border-wgc-gold-500/30">
                      <Shield className="w-7 h-7 text-wgc-gold-500" />
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-wgc-gold-500 mb-1 font-mono">Layer 2 — WGC Infrastructure</div>
                      <h3 className="text-xl font-bold tracking-tight mb-1 text-slate-50">Waypoint Gateway Collective</h3>
                      <p className="text-[15px] font-medium leading-relaxed text-wgc-navy-500 tracking-tight opacity-90">API management, partner authentication, fee calculation, merchant routing, reporting, recurring billing, and webhook delivery.</p>
                    </div>
                  </div>
                </div>
              </ScrollFade>

              <div className="flex justify-center"><div className="w-px h-6 bg-wgc-navy-100"></div></div>

              <ScrollFade delay={300}>
                <div className="relative bg-white rounded-3xl p-6 md:p-10 shadow-lg z-10 transform hover:-translate-y-1 transition-all border border-wgc-navy-100">
                  <div className="flex flex-col md:flex-row items-center md:items-start gap-6 text-center md:text-left">
                    <div className="w-16 h-16 bg-wgc-gold-500/10 rounded-2xl flex items-center justify-center text-wgc-gold-500 shadow-sm border border-wgc-gold-500/20 flex-shrink-0">
                      <Landmark className="w-7 h-7" />
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-wgc-gold-500 mb-1 font-mono">Layer 3 — Banking Rail</div>
                      <h3 className="text-xl font-bold text-wgc-navy-900 tracking-tight mb-1">WGC Core Processing</h3>
                      <p className="text-[15px] font-medium text-wgc-navy-500 leading-relaxed tracking-tight opacity-80">PCI Level 1 certified card processing and ACH network. Settlement, compliance, and bank-grade security — fully managed.</p>
                    </div>
                  </div>
                </div>
              </ScrollFade>
            </div>
          </div>
        </section>

        {/* DATA FLOW */}
        <section className="py-28 bg-wgc-off border-b border-wgc-navy-100">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <ScrollFade>
              <div className="text-center mb-20">
                <h2 className="text-4xl sm:text-5xl font-bold text-wgc-navy-900 tracking-tight mb-4">What Happens When Someone Gives</h2>
                <p className="text-lg text-wgc-navy-500 font-medium max-w-2xl mx-auto tracking-tight opacity-90">A donation processed in real time — from tap to treasury.</p>
              </div>
            </ScrollFade>
            <div className="space-y-4">
              {PAYMENT_STEPS.map((step, i) => (
                <ScrollFade key={step.label} delay={i * 80}>
                  <div className="flex items-start gap-6 p-6 bg-white rounded-2xl border border-wgc-navy-100 shadow-sm hover:shadow-md transition-all">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-wgc-navy-900 font-bold text-sm flex-shrink-0 mt-0.5 bg-gradient-to-br from-wgc-gold-500 to-amber-600 shadow-md">
                      {i + 1}
                    </div>
                    <div>
                      <div className="font-bold text-wgc-navy-900 mb-1 tracking-tight">{step.label}</div>
                      <div className="text-sm font-medium text-wgc-navy-500 leading-relaxed tracking-tight opacity-80">{step.description}</div>
                    </div>
                  </div>
                </ScrollFade>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <CTASection
          headline="Ready to integrate?"
          subheadline="Join software partners building Kingdom-aligned giving experiences with WGC."
          ctaText="Contact Sales"
          ctaLink="/contact"
        />
      </main>
      <Footer />
    </>
  );
}
