import Link from "next/link";
import { ShieldCheck, CheckCircle2, Zap, Settings, Globe, BarChart3, Database, Code2 } from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import FeatureCard from "@/components/ui/FeatureCard";
import CTASection from "@/components/ui/CTASection";
import ScrollFade from "@/components/ui/ScrollFade";

const IMPACT_ITEMS = [
  {
    icon: Database,
    title: "White-label payments",
    description: "Embedded payments for church and nonprofit software. WGC disappears behind your brand.",
  },
  {
    icon: CheckCircle2,
    title: "Low-cost ACH",
    description: "Reduced costs for recurring and large donations. Stewardship-first pricing.",
  },
  {
    icon: Code2,
    title: "Partner developers",
    description: "Built for software platforms serving ministries. Documents, APIs, and tools ready.",
  },
  {
    icon: ShieldCheck,
    title: "PCI compliance",
    description: "Level 1 security for ministry trust. We handle the security overhead.",
  },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "name": "Waypoint Gateway Collective (WGC)",
      "url": "https://www.wgcpayments.com",
      "logo": "https://www.wgcpayments.com/wgc-brand-final.png",
      "description": "Payment infrastructure for software that serves the Church."
    },
    {
      "@type": "Product",
      "name": "WGC White-Label Payment Processing",
      "description": "White-label payment processing infrastructure designed for church and nonprofit software platforms.",
      "brand": {
        "@type": "Brand",
        "name": "WGC"
      }
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What's the most cost-effective church payment processor in Kansas City?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "WGC is the most cost-effective church payment processor in Kansas City with a flat 25¢ ACH rate and capped card processing fees at 2.3% + 25¢. By avoiding standard percentage-based ACH markups, local ministries in the KC metro save thousands annually."
          }
        },
        {
          "@type": "Question",
          "name": "Who offers white-label payment processing for church software?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Way Point Gateway Collective (WGC) offers fully white-label payment processing infrastructure designed specifically for church and nonprofit software platforms. This means your software brand stays front and center while WGC manages the compliance and orchestration in the background."
          }
        },
        {
          "@type": "Question",
          "name": "How much does nonprofit payment processing cost?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Nonprofit payment processing with WGC costs a maximum of 2.3% + 25¢ per card transaction, 25¢ per ACH transaction, and a simple $10 monthly platform fee per organization. We prioritize transparency over hidden fees."
          }
        },
        {
          "@type": "Question",
          "name": "What's the best Tithe.ly alternative in 2026?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "WGC is the best Tithe.ly alternative in 2026 for organizations seeking lower flat-rate ACH fees, deeper white-label integration, and strict PCI Level 1 compliance without hidden costs. It provides superior orchestration for software platforms that serve ministries."
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
                  <span className="text-[10px] font-black uppercase tracking-[0.4em] text-wgc-gold-500/90 font-mono">Ministry Rails</span>
                </div>
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] mb-8 !text-white">
                  The white label payments option built for <span className="text-wgc-gold-500 italic">churches, non-profits,</span> & <span className="text-wgc-navy-300">their software.</span>
                </h1>
                <p className="text-lg sm:text-xl font-medium leading-relaxed mb-12 text-white/70 max-w-2xl tracking-tight">
                  WGC provides the white-label donation engine and ministry settlement rails for the platforms building the future of Kingdom stewardship.
                </p>
                <div className="flex flex-col md:flex-row gap-4">
                  <Link href="/contact" className="bg-wgc-gold-500 text-wgc-navy-950 inline-flex items-center justify-center px-8 py-5 text-[13px] font-bold rounded-2xl shadow-[0_20px_40px_rgba(234,179,8,0.2)] transform transition-all hover:scale-105 hover:bg-white uppercase tracking-widest">
                    Get More Info
                  </Link>
                  <Link href="/start" className="bg-wgc-gold-500 text-wgc-navy-950 inline-flex items-center justify-center px-8 py-5 text-[13px] font-bold rounded-2xl shadow-[0_20px_40px_rgba(234,179,8,0.2)] transform transition-all hover:scale-105 hover:bg-white uppercase tracking-widest">
                    Get Approved
                  </Link>
                  <Link href="/demo/church-dashboard" className="inline-flex items-center justify-center px-8 py-5 text-[13px] font-bold rounded-2xl transition-all border border-white/20 text-white/80 hover:bg-white hover:text-wgc-navy-950 uppercase tracking-widest">
                    View Demo Dashboard
                  </Link>
                </div>
              </ScrollFade>
 
              {/* RIGHT: Ministry Gallery Frame */}
              <ScrollFade delay={200} className="lg:col-span-5">
                <div className="relative group">
                  <div className="relative rounded-[3rem] overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.4)] border border-white/10 aspect-[4/5] lg:aspect-auto lg:h-[600px]">
                    <img 
                      src="/images/church.png" 
                      alt="Modern Church Community"
                      className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105 brightness-[1.02]"
                    />
                    
                    {/* Top Right: Metric Badge */}
                    <div className="absolute top-8 right-8 bg-white p-5 rounded-2xl shadow-2xl border border-wgc-navy-100 z-20 animate-float">
                      <div className="text-[9px] font-black text-wgc-gold-600 uppercase tracking-widest mb-1 font-mono">Stewardship</div>
                      <div className="text-xl font-bold text-wgc-navy-950">Save 15-20%</div>
                    </div>

                    {/* Bottom: Solid Quote Bar */}
                    <div className="absolute bottom-0 left-0 right-0 bg-wgc-navy-950/90 backdrop-blur-md p-10 border-t border-white/10">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-8 h-px bg-wgc-gold-500"></div>
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-wgc-gold-500 font-mono">Mission Protocol</span>
                      </div>
                      <blockquote className="relative z-10">
                        <p className="text-lg sm:text-xl font-bold leading-snug italic text-white tracking-tight">
                          "We are co-workers in God&apos;s service; you are God&apos;s field, God&apos;s building."
                        </p>
                        <footer className="mt-3">
                          <span className="font-bold text-[10px] uppercase tracking-widest text-wgc-gold-500/60 font-mono">1 Corinthians 3:9</span>
                        </footer>
                      </blockquote>
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
                <ShieldCheck className="w-5 h-5 text-wgc-gold-500 opacity-90" />
                PCI Level 1 Compliance
              </div>
              <div className="flex items-center gap-3 group">
                <CheckCircle2 className="w-5 h-5 text-wgc-gold-500 opacity-90" />
                ACH Optimization
              </div>
              <div className="flex items-center gap-3 group">
                <CheckCircle2 className="w-5 h-5 text-wgc-gold-500 opacity-90" />
                White-label Partner Console
              </div>
              <div className="flex items-center gap-3 group">
                <ShieldCheck className="w-5 h-5 text-wgc-gold-500 opacity-90" />
                Audited Protocols
              </div>
            </div>
          </div>
        </section>

        {/* THE PARTNER FLOW */}
        <section className="py-32 bg-white relative overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 text-center relative z-10">
            <ScrollFade>
              <h2 className="text-4xl md:text-6xl lg:text-7xl font-bold text-wgc-navy-950 mb-20 tracking-tight">The Partner Flow</h2>
              <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-16">
                {/* Step 1 */}
                <div className="bg-wgc-off rounded-3xl p-10 w-full max-w-[320px] shadow-xl border border-wgc-navy-100">
                  <div className="text-[9px] font-bold text-wgc-navy-400 uppercase tracking-widest mb-6 font-mono">Church Partner</div>
                  <h3 className="text-xl font-bold text-wgc-navy-950 tracking-tight">Your <br />Software</h3>
                </div>
                
                {/* Arrow */}
                <div className="flex items-center justify-center">
                  <div className="w-10 h-10 rounded-full border-2 border-wgc-gold-500/30 flex items-center justify-center text-wgc-gold-500">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                </div>

                {/* Step 2 */}
                <div className="bg-wgc-grad-navy rounded-3xl p-10 w-full max-w-[320px] shadow-2xl border border-white/10">
                  <div className="text-[9px] font-black text-wgc-gold-500 uppercase tracking-widest mb-6 font-mono">Orchestration</div>
                  <h3 className="text-xl font-black !text-white uppercase tracking-tight">Gateway API</h3>
                </div>

                {/* Arrow */}
                <div className="flex items-center justify-center">
                   <div className="w-10 h-10 rounded-full border-2 border-wgc-gold-500/30 flex items-center justify-center text-wgc-gold-500">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                </div>

                {/* Step 3 */}
                <div className="bg-wgc-off rounded-3xl p-10 w-full max-w-[320px] shadow-xl border border-wgc-navy-100">
                  <div className="text-[9px] font-bold text-wgc-navy-400 uppercase tracking-widest mb-6 font-mono">Settlement</div>
                  <h3 className="text-xl font-bold text-wgc-navy-950 tracking-tight">Ministry <br />Merchant</h3>
                </div>
              </div>
            </ScrollFade>
          </div>
        </section>

        {/* MINISTRY IMPACT */}
        <section className="pt-20 pb-32 bg-white relative overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <ScrollFade>
              <div className="text-center mb-24">
                <div className="inline-flex items-center px-6 py-3 rounded-xl bg-wgc-navy-50 text-wgc-navy-950 text-[11px] font-black uppercase tracking-widest border border-wgc-navy-100 font-mono mb-12">
                   Ministry Stewardship
                </div>
                <h2 className="text-5xl sm:text-7xl lg:text-8xl font-black text-wgc-navy-950 tracking-tight mb-8 leading-none">The Partner Advantage</h2>
                <p className="text-[13px] text-wgc-navy-400 font-bold max-w-2xl mx-auto leading-relaxed tracking-widest opacity-70">
                  WGC provides the technical foundation so you can focus on building the best experience for your ministries.
                </p>
              </div>
            </ScrollFade>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-10 items-stretch">
              <ScrollFade className="lg:col-span-1">
                <div className="relative rounded-[3rem] overflow-hidden shadow-2xl h-full min-h-[450px] group border border-wgc-navy-100">
                    <img 
                      src="/images/partners.png" 
                      alt="Partner Impact"
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
                <h2 className="text-5xl sm:text-7xl lg:text-8xl font-bold !text-white tracking-tight mb-6">Lifecycle Logic</h2>
                <p className="text-[11px] font-black text-wgc-gold-500 tracking-[0.4em] font-mono">From Stewardship to Settlement. Fully Orchestrated.</p>
              </div>
            </ScrollFade>

            <div className="grid lg:grid-cols-3 gap-12 relative">
              <div className="hidden lg:block absolute top-1/2 left-0 w-full h-px bg-wgc-navy-800 -translate-y-1/2 opacity-40"></div>

              {/* Step 1 */}
              <ScrollFade delay={0}>
                <div className="relative bg-wgc-navy-950 rounded-[2.5rem] p-12 border border-white/10 shadow-2xl group hover:-translate-y-2 transition-transform duration-500">
                  <div className="w-12 h-12 rounded-full bg-white text-wgc-navy-950 flex items-center justify-center text-lg font-black mb-10 shadow-xl group-hover:scale-110 transition-transform">01</div>
                  <h3 className="text-xl font-black !text-white mb-4 tracking-tight">Registry Integration</h3>
                  <p className="text-[13px] font-bold text-white/60 leading-relaxed mb-8 tracking-widest">Deploy documented, production-ready APIs that feel familiar. Scale indefinitely across your entire network.</p>
                  <Link href="/developers" className="inline-flex items-center text-[11px] font-black text-wgc-gold-500 hover:text-white transition-colors tracking-[0.2em] font-mono">
                    Protocol Specs 
                  </Link>
                </div>
              </ScrollFade>

              {/* Step 2 */}
              <ScrollFade delay={150}>
                <div className="relative bg-wgc-navy-950 rounded-[2.5rem] p-12 border border-white/10 shadow-2xl group hover:-translate-y-2 transition-transform duration-500">
                  <div className="w-10 h-10 rounded-full bg-wgc-gold-500 text-wgc-navy-950 flex items-center justify-center text-lg font-black mb-10 shadow-xl group-hover:scale-110 transition-transform">02</div>
                  <h3 className="text-xl font-black !text-white mb-4 tracking-tight">Stewardship Flow</h3>
                  <p className="text-[13px] font-bold text-white/60 leading-relaxed mb-8 tracking-widest">Donors use the interface they already trust. WGC disappears behind your brand while managing complexity.</p>
                  <Link href="/demo/donation" className="inline-flex items-center text-[11px] font-black text-wgc-gold-500 hover:text-white transition-colors tracking-[0.2em] font-mono">
                    Demo Flow 
                  </Link>
                </div>
              </ScrollFade>

              {/* Step 3 */}
              <ScrollFade delay={300}>
                <div className="relative bg-wgc-navy-950 rounded-[2.5rem] p-12 border border-white/10 shadow-2xl group hover:-translate-y-2 transition-transform duration-500">
                  <div className="w-10 h-10 rounded-full bg-wgc-navy-700 text-white flex items-center justify-center text-lg font-black mb-10 shadow-xl group-hover:scale-110 transition-transform">03</div>
                  <h3 className="text-xl font-black !text-white mb-4 tracking-tight">Audit & Settlement</h3>
                  <p className="text-[13px] font-bold text-white/60 leading-relaxed mb-8 tracking-widest">Compliance, PCI, reporting, and high-frequency payouts are handled securely via our robust orchestration layer.</p>
                  <div className="inline-flex items-center text-[11px] font-black text-wgc-gold-500 tracking-[0.2em] font-mono">
                    Audit Ready
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
                  &quot;We empower ministries that serve the Kingdom to be <span className="text-wgc-gold-500">unstoppable</span>. We provide the infrastructure; you provide the mission.&quot;
                </p>
                <footer className="flex items-center justify-center gap-6">
                  <div className="w-12 h-px bg-white/20"></div>
                  <span className="text-[12px] font-black tracking-[0.4em] text-wgc-gold-500 font-mono">WGC MISSION PROTOCOL</span>
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
                  Ministry stewardship
                </h2>
              </div>

              <div className="grid grid-cols-1 gap-8 max-w-2xl mx-auto">
                 <Link href="/resources/church-payment-processing-guide-2026" className="group block text-center">
                    <h3 className="text-xl sm:text-2xl font-bold text-wgc-navy-950 tracking-tight resource-glow transition-all duration-500 group-hover:text-wgc-gold-500 group-hover:-translate-y-2 group-hover:scale-105">Best payment processor for churches in 2026</h3>
                 </Link>
                 <Link href="/resources/white-label-payment-processing-nonprofit-church-software" className="group block text-center">
                    <h3 className="text-xl sm:text-2xl font-bold text-wgc-navy-950 tracking-tight resource-glow transition-all duration-500 group-hover:text-wgc-gold-500 group-hover:-translate-y-2 group-hover:scale-105">How to white-label payments for nonprofit software</h3>
                 </Link>
                 <Link href="/resources/church-payment-processing-pricing-guide" className="group block text-center">
                    <h3 className="text-xl sm:text-2xl font-bold text-wgc-gold-500 tracking-tight resource-glow transition-all duration-500 group-hover:text-wgc-navy-950 group-hover:-translate-y-2 group-hover:scale-105">Stripe vs Tithe.ly vs WGC: Fee breakdown</h3>
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
                <h2 className="text-3xl font-bold text-wgc-navy-950 tracking-tight mb-4">Purpose-Built Infrastructure</h2>
                <p className="text-lg text-wgc-navy-500 font-medium max-w-2xl mx-auto tracking-tight opacity-90">Why software platforms choose WGC over generic payment rails.</p>
              </div>
            </ScrollFade>
            
            <ScrollFade>
              <div className="overflow-x-auto rounded-3xl bg-white shadow-xl border border-wgc-navy-100">
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
                      { f: 'Built for Ministries', w: 'Native alignment', s: 'Broad Retail' },
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

        {/* FREQUENTLY ASKED QUESTIONS (SEO) */}
        <section className="py-24 bg-white relative">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <ScrollFade>
              <div className="text-center mb-16">
                <h2 className="text-3xl font-bold text-wgc-navy-950 tracking-tight mb-4">Frequently Asked Questions</h2>
                <p className="text-lg text-wgc-navy-500 font-medium tracking-tight">Learn more about how WGC is building the best payment processor for churches in 2026.</p>
              </div>
              <div className="space-y-8">
                <div className="bg-wgc-off p-8 rounded-3xl border border-wgc-navy-50">
                  <h3 className="text-xl font-bold text-wgc-navy-950 mb-3">What's the most cost-effective church payment processor in Kansas City?</h3>
                  <p className="text-wgc-navy-500 leading-relaxed font-medium">WGC is the most cost-effective church payment processor in Kansas City with a flat 25¢ ACH rate and capped card processing fees at 2.3% + 25¢. By avoiding standard percentage-based ACH markups, local ministries in the KC metro save thousands annually.</p>
                </div>
                <div className="bg-wgc-off p-8 rounded-3xl border border-wgc-navy-50">
                  <h3 className="text-xl font-bold text-wgc-navy-950 mb-3">Who offers white-label payment processing for church software?</h3>
                  <p className="text-wgc-navy-500 leading-relaxed font-medium">Way Point Gateway Collective (WGC) offers fully white-label payment processing infrastructure designed specifically for church and nonprofit software platforms. This means your software brand stays front and center while WGC manages the compliance and orchestration in the background.</p>
                </div>
                <div className="bg-wgc-off p-8 rounded-3xl border border-wgc-navy-50">
                  <h3 className="text-xl font-bold text-wgc-navy-950 mb-3">How much does nonprofit payment processing cost?</h3>
                  <p className="text-wgc-navy-500 leading-relaxed font-medium">Nonprofit payment processing with WGC costs a maximum of 2.3% + 25¢ per card transaction, 25¢ per ACH transaction, and a simple $10 monthly platform fee per organization. We prioritize transparency over hidden fees.</p>
                </div>
                <div className="bg-wgc-off p-8 rounded-3xl border border-wgc-navy-50">
                  <h3 className="text-xl font-bold text-wgc-navy-950 mb-3">What's the best Tithe.ly alternative in 2026?</h3>
                  <p className="text-wgc-navy-500 leading-relaxed font-medium">WGC is the best Tithe.ly alternative in 2026 for organizations seeking lower flat-rate ACH fees, deeper white-label integration, and strict PCI Level 1 compliance without hidden costs. It provides superior orchestration for software platforms that serve ministries.</p>
                </div>
              </div>
            </ScrollFade>
          </div>
        </section>

        {/* FINAL CALL */}
        <section className="bg-wgc-navy-950 pb-20 border-t border-white/5">
          <CTASection 
            headline="Ready to establish your ministry registry?"
            subheadline="Join the movement of software partners building the future of Kingdom stewardship."
            ctaText="Get Approved"
            ctaLink="/start"
          />
        </section>
      </main>
      <Footer />
    </>
  );
}

function ResourceCard({ href, title, description, tag }: { href: string; title: string; description: string; tag: string }) {
  return (
    <Link href={href} className="group">
      <div className="bg-wgc-off p-10 rounded-[2.5rem] border border-wgc-navy-100 h-full flex flex-col transition-all hover:bg-white hover:shadow-2xl hover:shadow-wgc-navy-950/5 hover:-translate-y-2 hover:border-wgc-gold-500/20 duration-500">
        <div className="mb-6">
          <span className="text-[10px] font-bold text-wgc-gold-600 tracking-[0.3em] font-mono">{tag}</span>
        </div>
        <h3 className="text-2xl font-bold text-wgc-navy-950 mb-6 tracking-tight leading-tight group-hover:text-wgc-gold-600 transition-colors">{title}</h3>
        <p className="text-sm font-medium text-wgc-navy-400 mb-10 leading-relaxed flex-grow">{description}</p>
        <div className="flex items-center gap-3 text-[11px] font-bold text-wgc-navy-900 tracking-[0.2em] font-mono group-hover:gap-5 transition-all">
          Read Guide <div className="w-6 h-px bg-wgc-gold-500"></div>
        </div>
      </div>
    </Link>
  );
}
