import Link from "next/link";
import { ChevronLeft, CheckCircle2, Box, UserPlus, CreditCard, BarChart4, Cpu } from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ResourceCTA from "@/components/resources/ResourceCTA";
import ScrollFade from "@/components/ui/ScrollFade";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How to White-Label Payments for Nonprofit Software | WGC",
  description: "A step-by-step look at white-labeling payments inside nonprofit and church software, from gateway setup to settlement and compliance.",
  openGraph: {
    title: "How to White-Label Payments for Nonprofit Software | WGC",
    description: "A step-by-step look at white-labeling payments inside nonprofit and church software, from gateway setup to settlement and compliance.",
    url: "https://www.wgcpayments.com/resources/white-label-payment-processing-nonprofit-church-software",
  },
};


const MEANINGS = ['Onboarding', 'Donation Page', 'Recurring Billing', 'Payouts', 'Reporting'];
const BENEFITS = ['Better brand continuity', 'Smoother user experience', 'Stronger retention', 'Greater ownership of the journey'];

const FEATURE_BLOCKS = [
  {
    icon: UserPlus,
    title: 'Branded Onboarding',
    text: 'Onboard your merchants through a seamless flow that lives inside your application. No external redirects or disconnected paperwork.'
  },
  {
    icon: Box,
    title: 'Embedded Donation Page',
    text: 'Keep the donation flow consistent with your platform UI. Our API supports highly customizable, secure donation page experiences.'
  },
  {
    icon: CreditCard,
    title: 'Recurring Donations',
    text: 'Automate weekly, monthly, or custom schedules. We handle the orchestration while you manage the donor relationship.'
  },
  {
    icon: BarChart4,
    title: 'Reporting & Visibility',
    text: 'Provide your users with real-time payout visibility and transaction history directly within your proprietary dashboard.'
  }
];

const WGC_FEATURES = ['Card Payments', 'ACH Support', 'Recurring Billing', 'Payout Visibility', 'Dashboard Reporting', 'Mission Aligned'];

export default function WhiteLabelGuidePage() {
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
               <div className="w-1.5 h-1.5 rounded-full bg-wgc-gold-500"></div>
               <span className="text-[9px] font-bold text-wgc-navy-400 uppercase tracking-widest font-mono">Protocol Documentation</span>
            </div>
          </div>
        </nav>

        {/* Article Hero */}
        <header className="pt-16 pb-12 bg-white border-b border-wgc-navy-50">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <ScrollFade>
              <div className="flex items-center gap-2 text-wgc-gold-600 font-bold text-[10px] uppercase tracking-[0.3em] mb-6 font-mono">
                <div className="w-8 h-px bg-wgc-gold-500"></div>
                Software Vertical Guide
              </div>
              <h1 className="text-4xl md:text-5xl font-bold text-wgc-navy-900 tracking-tighter mb-8 tracking-tight leading-[0.95]">
                How to White-Label Payments for <span className="text-wgc-gold-500">Nonprofit Software</span>
              </h1>
              <p className="text-lg md:text-xl text-wgc-navy-600 font-medium leading-relaxed italic border-l-4 border-wgc-gold-500 pl-6 border-opacity-30 opacity-90">
                For nonprofit and church software platforms, payments should feel native to the product. White-label payment processing makes it possible to offer branded onboarding, embedded donation forms, and payout visibility without a disconnected experience.
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
                    <h2 className="text-2xl font-bold tracking-tight m-0">What white-label payment processing means</h2>
                  </div>
                  <p className="opacity-80">White-label payment processing allows a software platform to present the entire payment experience under its own brand. This isn&apos;t just a logo change; it is a full orchestration of the financial lifecycle:</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-8">
                    {MEANINGS.map((item) => (
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
                    <h2 className="text-2xl font-bold tracking-tight m-0">Why nonprofit and church software platforms need embedded payments</h2>
                  </div>
                  <p className="opacity-80">The core advantage of white-labeling is **brand continuity**. Churches and nonprofits value trust above all else. When a donor is redirected to a generic third-party site, trust is diluted. Embedded payments provide:</p>
                  <ul className="list-none p-0 space-y-4">
                     {BENEFITS.map((benefit) => (
                        <li key={benefit} className="flex items-start gap-3">
                          <div className="w-5 h-5 rounded bg-wgc-gold-500 text-wgc-navy-900 flex items-center justify-center mt-1 flex-shrink-0">
                            <CheckCircle2 className="w-3 h-3" />
                          </div>
                          <span className="font-bold text-wgc-navy-900 italic">{benefit}</span>
                        </li>
                     ))}
                  </ul>
                </section>
              </ScrollFade>

              {/* Feature Blocks */}
              <ScrollFade>
                <section>
                  <div className="flex items-center gap-4 mb-12">
                    <div className="w-1.5 h-8 bg-wgc-gold-500 rounded-full"></div>
                    <h2 className="text-2xl font-bold tracking-tight m-0">Ministry Pillars</h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {FEATURE_BLOCKS.map((block) => (
                      <div key={block.title} className="p-8 bg-wgc-off rounded-[2.5rem] border border-wgc-navy-100 group hover:shadow-xl transition-all">
                        <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-wgc-gold-500 mb-6 group-hover:scale-110 transition-transform shadow-lg border border-gold-500/10">
                          <block.icon className="w-5 h-5" />
                        </div>
                        <h4 className="text-sm font-bold text-wgc-navy-900 uppercase tracking-widest mb-3 font-mono">{block.title}</h4>
                        <p className="text-xs text-wgc-navy-500 leading-relaxed font-medium opacity-80 tracking-tight">{block.text}</p>
                      </div>
                    ))}
                  </div>
                </section>
              </ScrollFade>

              <ScrollFade>
                <section>
                  <div className="flex items-center gap-4 mb-8">
                    <div className="w-1.5 h-8 bg-wgc-gold-500 rounded-full"></div>
                    <h2 className="text-2xl font-bold tracking-tight m-0">The core infrastructure behind white-label payments</h2>
                  </div>
                  <p className="opacity-80">Strong white-label systems typically require a robust merchant onboarding flow, secure transaction processing, recurring billing support, and compliance-ready workflows. WGC manages this complexity through a unified API architecture.</p>
                </section>
              </ScrollFade>

              <ScrollFade>
                <section className="bg-white p-12 rounded-[3.5rem] text-wgc-navy-900 relative overflow-hidden border border-wgc-gold-500/20">
                   <div className="absolute -right-20 -top-20 w-80 h-80 bg-wgc-gold-500/10 blur-[100px] rounded-full"></div>
                   <div className="relative z-10">
                     <div className="flex items-center gap-4 mb-8">
                       <Cpu className="w-8 h-8 text-wgc-gold-500" />
                       <h2 className="text-2xl font-bold tracking-tight m-0">How WGC powers branded experiences</h2>
                     </div>
                     <p className="text-wgc-navy-300 mb-8 font-medium tracking-tight opacity-90 leading-relaxed">WGC is built for embedded, branded payment experiences. We support card payments, ACH, recurring donation tools, and dashboard reporting—all designed specifically for church and nonprofit software use cases.</p>
                     <div className="flex flex-wrap gap-3">
                        {WGC_FEATURES.map((tag) => (
                          <span key={tag} className="px-3 py-1 bg-white/10 rounded-lg text-[9px] font-bold uppercase tracking-widest text-wgc-gold-500 border border-wgc-navy-100 font-mono">{tag}</span>
                        ))}
                     </div>
                   </div>
                </section>
              </ScrollFade>

              {/* Internal Linking */}
              <ScrollFade>
                <section className="pt-16 border-t border-wgc-navy-50">
                   <h4 className="text-[10px] font-bold text-wgc-navy-400 uppercase tracking-[0.3em] mb-8 font-mono">Related Resources</h4>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <Link href="/resources/church-payment-processing-guide-2026" className="p-6 bg-wgc-off border border-wgc-navy-100 rounded-3xl hover:border-wgc-gold-300 transition-all group">
                         <p className="text-xs font-bold text-wgc-navy-900 uppercase tracking-widest mb-2 group-hover:text-wgc-gold-600 transition-colors">Core Processing Guide</p>
                         <p className="text-[10px] text-wgc-navy-400 font-medium opacity-80 leading-relaxed">Learn the fundamentals of card processing and ACH for 2026.</p>
                      </Link>
                      <Link href="/resources/church-payment-processing-pricing-guide" className="p-6 bg-wgc-off border border-wgc-navy-100 rounded-3xl hover:border-wgc-gold-300 transition-all group">
                         <p className="text-xs font-bold text-wgc-navy-900 uppercase tracking-widest mb-2 group-hover:text-wgc-gold-600 transition-colors">Pricing & Transparency</p>
                         <p className="text-[10px] text-wgc-navy-400 font-medium opacity-80 leading-relaxed">Full breakdown of the WGC fee structure and subscription model.</p>
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
