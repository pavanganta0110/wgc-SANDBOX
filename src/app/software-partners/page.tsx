import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ChevronDown, CheckCircle2, ShieldCheck, Zap, Globe, BarChart3, Settings } from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import CTASection from "@/components/ui/CTASection";
import ScrollFade from "@/components/ui/ScrollFade";

import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "/software-partners" },
  title: "Payment Infrastructure for Software Platforms | WGC for Partners",
  description: "WGC serves mission-driven organizations directly through our platform, and also provides embedded payment infrastructure — onboarding, payments, and recurring giving — for software companies serving nonprofits, churches, and other 501(c) organizations.",
  openGraph: {
    images: [{ url: "/og/default.png", width: 1200, height: 630 }],
    title: "Payment Infrastructure for Software Platforms | WGC for Partners",
    description: "WGC serves organizations directly, and also provides embedded payment infrastructure for software platforms serving nonprofits, churches, and other mission-driven organizations.",
    url: "https://www.wgcpayments.com/software-partners",
  },
};


const FEATURES = [
  {
    title: "White-Labeled Infrastructure",
    description: "Launch your own payment platform in days, fully embedded in your product with your own branding.",
    icon: Settings,
  },
  {
    title: "Flat-Rate ACH",
    description: "Honoring supporters' intent with 25¢ flat-rate ACH transfers. No percentage-based fees on large gifts.",
    icon: Zap,
  },
  {
    title: "Recurring Giving Engine",
    description: "Robust, automated recurring engine with native pause/resume and flexible scheduling built-in.",
    icon: Globe,
  },
  {
    title: "PCI Level 1 Compliance",
    description: "The highest level of security. We handle the compliance burden so you can focus on building your software.",
    icon: ShieldCheck,
  },
  {
    title: "Merchant Orchestration",
    description: "Onboard organizations, manage settlements, and handle payouts across your entire network through one guided integration.",
    icon: BarChart3,
  },
  {
    title: "Built for Mission-Driven Organizations",
    description: "Purpose-built for the nonprofits, churches, foundations, and other 501(c) organizations your platform already serves.",
    icon: CheckCircle2,
  },
];

export default function SoftwarePartnersPage() {
  return (
    <>
      <Header />
      <main className="flex-grow">
        {/* DARK HERO */}
        <section className="relative bg-wgc-off pt-32 pb-24 overflow-hidden border-b border-wgc-navy-800">
          <div className="absolute inset-0 opacity-[0.04]">
            <svg className="w-full h-full" fill="none">
              <pattern id="partners-hero-grid" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
                <path d="M 28 0 L 0 0 0 28" fill="none" stroke="white" strokeWidth="0.5" />
              </pattern>
              <rect width="100%" height="100%" fill="url(#partners-hero-grid)" />
            </svg>
          </div>
          <div className="absolute top-1/2 right-0 -translate-y-1/2 w-96 h-96 rounded-full blur-3xl opacity-10 pointer-events-none" style={{ background: "radial-gradient(circle, #eab308 0%, transparent 70%)" }}></div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <div className="lg:grid lg:grid-cols-2 lg:gap-16 items-center">
              <ScrollFade>
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-8 border border-wgc-gold-500/30 bg-wgc-gold-500/10">
                  <div className="w-1.5 h-1.5 rounded-full bg-wgc-gold-500"></div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-wgc-gold-500/90">For Software Platforms</span>
                </div>
                <h1 className="text-5xl sm:text-6xl font-bold tracking-tight leading-[1.05] mb-6 text-wgc-navy-900">
                  Payment infrastructure for <br /><span className="text-wgc-gold-500">software platforms.</span>
                </h1>
                <p className="text-xl font-medium leading-relaxed mb-6 text-wgc-navy-500 tracking-tight">
                  Integrate giving, recurring payments, ACH, and payouts directly into your platform — fully white-labeled.
                </p>
                <p className="text-base font-medium leading-relaxed mb-10 text-wgc-navy-400 tracking-tight">
                  WGC serves organizations directly through our own dashboard, and also provides this same infrastructure for the software platforms that serve them.
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                  <Link href="/contact" className="bg-wgc-gold-500 text-wgc-navy-900 inline-flex items-center justify-center px-8 py-4 text-sm font-bold rounded-full shadow-xl transform transition-all hover:scale-105 uppercase tracking-wider">
                    Apply for Partnership
                  </Link>
                  <Link href="/developers" className="inline-flex items-center justify-center px-8 py-4 text-sm font-bold rounded-full transition-all uppercase tracking-wider border border-slate-700 text-wgc-navy-500 hover:text-wgc-navy-900 hover:border-slate-500">
                    Review API Docs
                  </Link>
                </div>
              </ScrollFade>

              {/* Right Side Visual Card */}
              <ScrollFade delay={200}>
                <div className="mt-16 lg:mt-0 relative group">
                  <div className="relative rounded-[3rem] overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-white/10 aspect-[4/5] lg:aspect-auto lg:h-[600px]">
                    <Image
                      src="/images/partners.webp"
                      alt="Partner Collaboration"
                      fill
                      sizes="(max-width: 1024px) 100vw, 45vw"
                      className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105 brightness-[1.02]"
                    />
                    
                    {/* Bottom: Solid Quote Bar */}
                    <div className="absolute bottom-0 left-0 right-0 bg-slate-950/90 backdrop-blur-md p-10 border-t border-white/10">
                      <div className="relative z-10 flex items-center gap-3 mb-6">
                        <div className="w-10 h-px bg-wgc-gold-500"></div>
                        <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-wgc-gold-500/70">Our Core Focus</span>
                      </div>

                      <blockquote className="relative z-10">
                        <p className="text-xl sm:text-2xl font-bold leading-snug italic mb-4 text-slate-50 tracking-tight">
                          &quot;Help mission-driven organizations keep more of what they raise.&quot;
                        </p>
                        <footer className="flex items-center gap-3">
                          <span className="font-bold text-[11px] uppercase tracking-widest text-wgc-gold-500/60 font-mono">WGC Mission</span>
                        </footer>
                      </blockquote>
                    </div>
                  </div>
                </div>
              </ScrollFade>
            </div>
          </div>
        </section>

        {/* TWO PATHS */}
        <section className="py-20 bg-white border-b border-wgc-navy-100">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <ScrollFade>
              <div className="text-center mb-14">
                <h2 className="text-3xl md:text-4xl font-bold text-wgc-navy-900 tracking-tight mb-4">Two ways to work with WGC</h2>
                <p className="text-lg text-wgc-navy-500 max-w-2xl mx-auto">WGC serves mission-driven organizations directly, and also provides payment infrastructure for the software platforms that serve them.</p>
              </div>
            </ScrollFade>
            <div className="grid md:grid-cols-2 gap-8">
              <ScrollFade>
                <div className="h-full p-10 rounded-3xl border border-wgc-navy-100 bg-wgc-off">
                  <div className="text-[10px] font-black text-wgc-gold-600 uppercase tracking-widest mb-4 font-mono">For Organizations</div>
                  <h3 className="text-2xl font-bold text-wgc-navy-900 mb-4 tracking-tight">Use the WGC dashboard directly</h3>
                  <p className="text-wgc-navy-500 leading-relaxed mb-6">Nonprofits, churches, foundations, associations, and schools can sign up and run payments, supporters, and reporting from the WGC dashboard — no engineering required.</p>
                  <Link href="/start" className="inline-flex items-center text-[13px] font-bold text-wgc-gold-600 hover:text-wgc-navy-900 transition-colors">
                    Get Started &rarr;
                  </Link>
                </div>
              </ScrollFade>
              <ScrollFade delay={100}>
                <div className="h-full p-10 rounded-3xl border border-wgc-navy-100 bg-wgc-off">
                  <div className="text-[10px] font-black text-wgc-gold-600 uppercase tracking-widest mb-4 font-mono">For Software Platforms</div>
                  <h3 className="text-2xl font-bold text-wgc-navy-900 mb-4 tracking-tight">Embed WGC into your platform</h3>
                  <p className="text-wgc-navy-500 leading-relaxed mb-6">Software companies can embed WGC&apos;s payment infrastructure — onboarding, recurring payments, and payouts — directly into their own product through a guided integration.</p>
                  <Link href="/contact" className="inline-flex items-center text-[13px] font-bold text-wgc-gold-600 hover:text-wgc-navy-900 transition-colors">
                    Apply for Partnership &rarr;
                  </Link>
                </div>
              </ScrollFade>
            </div>
          </div>
        </section>

        {/* PROOF BAND */}
        <div className="bg-wgc-off border-b border-wgc-navy-800 py-8 text-center px-4 overflow-hidden relative">
          <div className="max-w-4xl mx-auto flex flex-wrap justify-center gap-6 sm:gap-12 text-wgc-navy-900 font-bold uppercase tracking-widest text-[11px]">
            <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-wgc-gold-500"></div> Built for Nonprofit & Church CRMs</div>
            <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-wgc-gold-500"></div> Recurring Giving Engine</div>
            <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-wgc-gold-500"></div> ACH + Card Payments</div>
            <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-wgc-gold-500"></div> White-label Experience</div>
          </div>
        </div>

        {/* PLATFORMS */}
        <section className="py-24 bg-wgc-off border-b border-wgc-navy-100/30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <ScrollFade>
              <div className="text-center mb-16">
                <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-wgc-navy-50 text-wgc-navy-600 text-[10px] font-bold tracking-[0.2em] uppercase mb-6 border border-wgc-navy-100 font-mono">Partnership focus</div>
                <h2 className="text-4xl font-bold text-wgc-navy-900 tracking-tight">Built for the platforms you trust</h2>
                <p className="text-lg text-wgc-navy-500 font-medium max-w-2xl mx-auto mt-4 tracking-tight opacity-90">Providing mission-grade payment rails beneath the software that nonprofits, ministries, and other 501(c) organizations use every day.</p>
              </div>
            </ScrollFade>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {['Church Management (ChMS)', 'Donation Platforms', 'Nonprofit CRMs', '501(c) Organization Software', 'Faith-based SaaS', 'Individual Fundraisers'].map((platform, i) => (
                <ScrollFade key={platform} delay={i * 100}>
                  <div className="p-8 rounded-2xl bg-white border border-wgc-navy-100 shadow-sm hover:shadow-md transition-all group hover:-translate-y-1">
                     <div className="text-lg font-bold text-wgc-navy-900 group-hover:text-wgc-gold-600 transition-colors">{platform}</div>
                     <div className="w-8 h-1 bg-wgc-gold-500 mt-4 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  </div>
                </ScrollFade>
              ))}
            </div>
          </div>
        </section>

        {/* PARTNER FLOW */}
        <section className="py-24 bg-white border-b border-wgc-navy-100/30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl font-bold text-wgc-navy-900 sm:text-4xl tracking-tight mb-16">The Partner Flow</h2>
            
            <div className="flex flex-col lg:flex-row items-center justify-center lg:items-stretch gap-8 relative">
              {/* Connector Line (Desktop) */}
              <div className="hidden lg:block absolute top-[60%] left-[20%] right-[20%] h-px bg-gradient-to-r from-transparent via-wgc-gold-500/30 to-transparent z-0"></div>

              {/* Step 1 */}
              <ScrollFade className="w-full lg:flex-1 relative z-10">
                <div className="h-full p-12 rounded-[2.5rem] border border-wgc-navy-100 bg-wgc-off shadow-sm hover:bg-white hover:shadow-xl transition-all duration-500 group">
                  <div className="text-[10px] font-bold text-wgc-navy-400 uppercase tracking-[0.3em] mb-8 font-mono group-hover:text-wgc-gold-600">Merchant Interface</div>
                  <div className="text-3xl font-bold text-wgc-navy-900 tracking-tighter leading-none">Your <br />Software</div>
                </div>
              </ScrollFade>
              
              <div className="flex items-center justify-center py-4 lg:py-0 relative z-10">
                <div className="w-12 h-12 rounded-full bg-wgc-gold-50 border border-wgc-gold-200 flex items-center justify-center shadow-sm">
                  <ArrowRight className="w-5 h-5 text-wgc-gold-600 hidden lg:block" />
                  <ChevronDown className="w-5 h-5 text-wgc-gold-600 lg:hidden" />
                </div>
              </div>
              
              {/* Step 2 (The Hub) */}
              <ScrollFade delay={150} className="w-full lg:flex-1 relative z-10">
                <div className="h-full p-12 rounded-[2.5rem] border border-wgc-gold-500/30 bg-white shadow-2xl relative overflow-hidden group hover:scale-[1.02] transition-transform duration-500">
                  <div className="absolute inset-0 bg-gradient-to-br from-wgc-gold-500/5 to-transparent opacity-50"></div>
                  <div className="relative z-10 text-[10px] font-bold text-wgc-gold-500 uppercase tracking-[0.3em] mb-8 font-mono">Core Infrastructure</div>
                  <div className="relative z-10 text-3xl font-bold text-wgc-navy-900 tracking-tighter leading-none">WGC Payments <br /><span className="text-wgc-gold-500">Gateway API</span></div>
                </div>
              </ScrollFade>
              
              <div className="flex items-center justify-center py-4 lg:py-0 relative z-10">
                <div className="w-12 h-12 rounded-full bg-wgc-gold-50 border border-wgc-gold-200 flex items-center justify-center shadow-sm">
                  <ArrowRight className="w-5 h-5 text-wgc-gold-600 hidden lg:block" />
                  <ChevronDown className="w-5 h-5 text-wgc-gold-600 lg:hidden" />
                </div>
              </div>
              
              {/* Step 3 */}
              <ScrollFade delay={300} className="w-full lg:flex-1 relative z-10">
                <div className="h-full p-12 rounded-[2.5rem] border border-wgc-navy-100 bg-wgc-off shadow-sm hover:bg-white hover:shadow-xl transition-all duration-500 group">
                  <div className="text-[10px] font-bold text-wgc-navy-400 uppercase tracking-[0.3em] mb-8 font-mono group-hover:text-wgc-gold-600">Final Recipients</div>
                  <div className="text-3xl font-bold text-wgc-navy-900 tracking-tighter leading-none">Served <br />Organization</div>
                </div>
              </ScrollFade>
            </div>
          </div>
        </section>

        {/* ADVANTAGE */}
        <section className="py-24 lg:py-32 bg-wgc-off border-t border-wgc-navy-100/10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <ScrollFade>
              <div className="text-center mb-20">
                <h2 className="text-4xl font-bold text-wgc-navy-900 mb-6 tracking-tight">The Partner Advantage</h2>
                <p className="mt-4 max-w-2xl text-lg text-wgc-navy-500 font-medium mx-auto tracking-tight opacity-90">Everything you need to launch a world-class payment platform, without the burden.</p>
              </div>
            </ScrollFade>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-10">
              {FEATURES.map((feature, i) => (
                <ScrollFade key={feature.title} delay={i * 80}>
                  <div className="bg-white p-10 rounded-3xl border border-wgc-navy-100 shadow-sm hover:shadow-lg transition-all transform hover:-translate-y-1 h-full text-left">
                    <div className="w-12 h-12 bg-wgc-navy-50 rounded-2xl flex items-center justify-center text-wgc-gold-500 mb-8 border border-wgc-navy-100">
                      <feature.icon className="w-6 h-6" />
                    </div>
                    <h3 className="text-xl font-bold text-wgc-navy-900 mb-4 tracking-tight">{feature.title}</h3>
                    <p className="text-wgc-navy-500 font-medium leading-relaxed tracking-tight opacity-80">{feature.description}</p>
                  </div>
                </ScrollFade>
              ))}
            </div>
          </div>
        </section>

        {/* QUOTE */}
        <section className="py-24 bg-white border-y border-wgc-navy-50">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <ScrollFade>
              <div className="w-12 h-1.5 metallic-gold mx-auto mb-10 rounded-full"></div>
              <h2 className="text-4xl font-bold text-wgc-navy-900 mb-10 tracking-tight leading-tight">Payment Infrastructure for Nonprofit, Church, and 501(c) Organization Software</h2>
              <div className="max-w-3xl mx-auto text-wgc-navy-500 space-y-8">
                <p className="text-2xl italic font-bold text-wgc-navy-900 leading-snug">
                  &quot;WGC serves mission-driven organizations directly through the WGC platform, and also provides payment infrastructure for the software companies that serve them.&quot;
                </p>
                <p className="text-lg font-medium leading-relaxed tracking-tight opacity-90">
                  When you embed WGC, your platform gets the same infrastructure that powers our own dashboard — aligned with your growth and your customers&apos; mission. With a transferable vault and flat-rate ACH, your platform scales efficiently while honoring your customers&apos; supporters.
                </p>
              </div>
            </ScrollFade>
          </div>
        </section>

        {/* COMPARISON */}
        <section className="py-24 bg-wgc-off">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <ScrollFade>
              <div className="text-center mb-16">
                <h2 className="text-3xl font-bold text-wgc-navy-900 tracking-tight mb-4">Purpose-Built Infrastructure</h2>
                <p className="text-lg text-wgc-navy-500 font-medium max-w-2xl mx-auto tracking-tight opacity-90">Why software platforms choose WGC over generic payment rails.</p>
              </div>
            </ScrollFade>
            
            <ScrollFade>
              <div className="overflow-hidden rounded-3xl bg-white shadow-xl border border-wgc-navy-100">
                <table className="w-full text-left">
                  <thead className="bg-wgc-off text-wgc-navy-900">
                    <tr>
                      <th className="py-6 px-10 text-[10px] font-bold uppercase tracking-widest">Platform Feature</th>
                      <th className="py-6 px-10 text-[10px] font-bold uppercase tracking-widest text-center text-wgc-gold-500">WGC Payments</th>
                      <th className="py-6 px-10 text-[10px] font-bold tracking-widest text-center text-wgc-navy-950/40 uppercase">Horizontal Rails</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-wgc-navy-50">
                    {[
                      { f: 'Built for Mission-Driven Orgs', w: 'Native alignment', s: 'Broad Retail' },
                      { f: 'ACH Optimization', w: '25¢ Flat-rate', s: 'Margin heavy' },
                      { f: 'Experience', w: 'Fully White-labeled', s: 'Redirected' }
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

        {/* CTA */}
        <CTASection
          headline="Ready to embed payments into your platform?"
          subheadline="Contact our team to review your software roadmap and request sandbox access."
          ctaText="Contact us"
          ctaLink="/contact"
        />
      </main>
      <Footer />
    </>
  );
}
