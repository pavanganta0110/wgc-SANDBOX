import Link from "next/link";
import { ChevronLeft, CheckCircle2, BarChart, Zap, RefreshCw, Landmark, Globe, Users, Settings, FileText } from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ResourceCTA from "@/components/resources/ResourceCTA";
import ScrollFade from "@/components/ui/ScrollFade";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Stripe vs Tithe.ly vs WGC: Fee Breakdown | WGC",
  description: "Compare payment processing fees across Stripe, Tithe.ly, and WGC for churches and nonprofits, with a clear breakdown of costs and ACH rates.",
  openGraph: {
    title: "Stripe vs Tithe.ly vs WGC: Fee Breakdown | WGC",
    description: "Compare payment processing fees across Stripe, Tithe.ly, and WGC for churches and nonprofits, with a clear breakdown of costs and ACH rates.",
    url: "https://www.wgcpayments.com/resources/church-payment-processing-pricing-guide",
  },
};


const PRICING_ITEMS = [
  'Dashboard Access',
  'Payout Visibility',
  'Recurring Payouts',
  'Historical Ledger',
  'Branded Donation Page',
  'PCI Compliance'
];

const INCLUSION_LIST = [
  { text: 'Payment Dashboard', icon: BarChart },
  { text: 'Transaction Tracking', icon: Zap },
  { text: 'Recurring Management', icon: RefreshCw },
  { text: 'Payout Visibility', icon: Landmark },
  { text: 'Branded Donation Page', icon: Globe },
  { text: 'Branded Onboarding', icon: Users },
  { text: 'Embedded Forms', icon: Settings },
  { text: 'Reporting Tools', icon: FileText },
  { text: 'Direct Bank Payouts', icon: Landmark }
];

export default function PricingGuidePage() {
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
               <span className="text-[9px] font-bold text-wgc-navy-400 uppercase tracking-widest font-mono">Pricing Transparency</span>
            </div>
          </div>
        </nav>

        {/* Article Hero */}
        <header className="pt-16 pb-12 bg-white border-b border-wgc-navy-50">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <ScrollFade>
              <div className="flex items-center gap-2 text-wgc-gold-600 font-bold text-[10px] uppercase tracking-[0.3em] mb-6 font-mono">
                <div className="w-8 h-px bg-wgc-gold-500"></div>
                Financial Stewardship
              </div>
              <h1 className="text-4xl md:text-5xl font-bold text-wgc-navy-900 tracking-tighter mb-8 tracking-tight leading-[0.95]">
                Stripe vs Tithe.ly vs <span className="text-wgc-gold-500">WGC: Fee Breakdown</span>
              </h1>
              <p className="text-lg md:text-xl text-wgc-navy-600 font-medium leading-relaxed italic border-l-4 border-wgc-gold-500 pl-6 border-opacity-30 opacity-90">
                A strong payment offering should be transparent, simple to explain, and supported by features like recurring donations, payout visibility, and reporting.
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
                  <div className="flex items-center gap-4 mb-10">
                    <div className="w-1.5 h-8 bg-wgc-gold-500 rounded-full"></div>
                    <h2 className="text-2xl font-bold tracking-tight m-0">WGC pricing structure</h2>
                  </div>
                  
                  {/* Premium Pricing Block */}
                  <div className="bg-white rounded-[3rem] p-10 md:p-16 text-wgc-navy-900 relative overflow-hidden shadow-2xl mb-12 border border-wgc-gold-500/20">
                    <div className="absolute top-0 right-0 w-96 h-96 bg-wgc-gold-500/10 blur-[150px] rounded-full"></div>
                    <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
                       <div>
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-white text-wgc-navy-900 rounded-full text-[10px] font-bold uppercase tracking-widest mb-6 shadow-lg shadow-white/10 font-mono">Ministry Standard</div>
                        <h3 className="text-3xl font-bold mb-6 tracking-tight leading-tight text-wgc-navy-900 italic">Simplified<br/>Orchestration</h3>
                        <ul className="space-y-4 list-none p-0">
                          {PRICING_ITEMS.map((item) => (
                            <li key={item} className="flex items-center gap-4">
                              <CheckCircle2 className="w-5 h-5 text-wgc-gold-500 shadow-sm" />
                              <span className="text-[10px] font-bold text-wgc-navy-900 uppercase tracking-widest font-mono">{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="bg-white/5 border border-wgc-navy-100 rounded-[2.5rem] p-10 text-center backdrop-blur-sm shadow-inner">
                        <div className="text-[10px] font-bold text-wgc-navy-900 uppercase tracking-[0.4em] mb-4 opacity-80 font-mono">Max Card Rate</div>
                        <div className="text-6xl font-bold text-wgc-navy-900 tracking-tighter mb-2">2.3%</div>
                        <div className="text-lg font-bold uppercase tracking-[0.3em] text-wgc-navy-900 mb-6">+ $0.25</div>
                        <div className="h-px bg-white/10 mb-8 mx-auto w-1/2"></div>
                        <div className="text-xl font-bold text-wgc-navy-900">$10<span className="text-[10px] text-wgc-navy-900 font-bold ml-2 tracking-widest uppercase opacity-70 font-mono">/ MO PER ORG</span></div>
                      </div>
                    </div>
                  </div>
                  <p className="text-center text-wgc-navy-400 italic opacity-80 font-medium tracking-tight">This structure is designed to stay simple and transparent, reducing administrative friction for organizations.</p>
                </section>
              </ScrollFade>

              <ScrollFade>
                <section>
                  <div className="flex items-center gap-4 mb-8">
                    <div className="w-1.5 h-8 bg-wgc-gold-500 rounded-full"></div>
                    <h2 className="text-2xl font-bold tracking-tight m-0">Card processing fees</h2>
                  </div>
                  <p className="opacity-80">The card processing rate is 2.3% + $0.25 per transaction as the maximum card rate. The monthly software subscription of $10 per organization ensures that the platform infrastructure remains mission-ready, providing the security and scale required by modern nonprofits.</p>
                </section>
              </ScrollFade>

              <ScrollFade>
                <section>
                  <div className="flex items-center gap-4 mb-8">
                    <div className="w-1.5 h-8 bg-wgc-gold-500 rounded-full"></div>
                    <h2 className="text-2xl font-bold tracking-tight m-0">ACH support and recurring donations</h2>
                  </div>
                  <p className="opacity-80">ACH / bank transfer support is available to provide a cost-effective alternative for larger gifts. Furthermore, recurring donation support helps organizations automate weekly, monthly, or custom schedules, creating more predictable donation flows.</p>
                </section>
              </ScrollFade>

              <ScrollFade>
                <section>
                  <div className="flex items-center gap-4 mb-8">
                    <div className="w-1.5 h-8 bg-wgc-gold-500 rounded-full"></div>
                    <h2 className="text-2xl font-bold tracking-tight m-0">Payout visibility and reporting tools</h2>
                  </div>
                  <p className="opacity-80">Organizations can track payment activity, payout status, recurring transactions, and complete donation history from the dashboard. This visibility is crucial for ministry financial audit and stewardship.</p>
                </section>
              </ScrollFade>

              {/* Comparison Table */}
              <ScrollFade>
                <section>
                  <div className="flex items-center gap-4 mb-8">
                    <div className="w-1.5 h-8 bg-wgc-gold-500 rounded-full"></div>
                    <h2 className="text-2xl font-bold tracking-tight m-0">Stripe vs Tithe.ly vs WGC</h2>
                  </div>
                  <div className="overflow-x-auto border border-wgc-navy-100 rounded-2xl shadow-sm mb-12">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-wgc-navy-50 border-b border-wgc-navy-100">
                          <th className="p-4 font-bold text-wgc-navy-950">Feature / Provider</th>
                          <th className="p-4 font-bold text-wgc-navy-950">WGC</th>
                          <th className="p-4 font-bold text-wgc-navy-950">Stripe</th>
                          <th className="p-4 font-bold text-wgc-navy-950">Tithe.ly</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-wgc-navy-50">
                          <td className="p-4 font-medium text-wgc-navy-950">Card Fees</td>
                          <td className="p-4 font-bold text-wgc-gold-600">2.30% + $0.25</td>
                          <td className="p-4 text-wgc-navy-600">2.2% + $0.30</td>
                          <td className="p-4 text-wgc-navy-600">2.9% + $0.30</td>
                        </tr>
                        <tr className="border-b border-wgc-navy-50">
                          <td className="p-4 font-medium text-wgc-navy-950">ACH / Bank Transfer</td>
                          <td className="p-4 font-bold text-wgc-gold-600">$0.25 flat-rate</td>
                          <td className="p-4 text-wgc-navy-600">0.8% (capped at $5)</td>
                          <td className="p-4 text-wgc-navy-600">1.0% + $0.30</td>
                        </tr>
                        <tr className="border-b border-wgc-navy-50">
                          <td className="p-4 font-medium text-wgc-navy-950">Monthly Platform Fee</td>
                          <td className="p-4 text-wgc-navy-600">$10 / org</td>
                          <td className="p-4 text-wgc-navy-600">$0</td>
                          <td className="p-4 text-wgc-navy-600">$0 (or $19/mo for extra features)</td>
                        </tr>
                        <tr>
                          <td className="p-4 font-medium text-wgc-navy-950">White-Label Capable</td>
                          <td className="p-4 text-wgc-navy-600">Yes (Native)</td>
                          <td className="p-4 text-wgc-navy-600">Yes (Connect)</td>
                          <td className="p-4 text-wgc-navy-600">No</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </section>
              </ScrollFade>

              {/* Feature Checklist */}
              <ScrollFade>
                <section className="bg-wgc-off rounded-[3rem] p-12 border border-wgc-navy-100">
                   <div className="text-center mb-12">
                      <h2 className="text-2xl font-bold tracking-tight m-0 mb-4 transition-all">Included in the WGC experience</h2>
                      <div className="w-16 h-1 bg-wgc-gold-500 mx-auto rounded-full"></div>
                   </div>
                   <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {INCLUSION_LIST.map((check, i) => (
                        <div key={i} className="flex items-center gap-4 p-4 hover:bg-white hover:shadow-sm rounded-2xl transition-all group">
                           <div className="w-8 h-8 rounded-lg bg-wgc-gold-100 flex items-center justify-center text-wgc-gold-600 group-hover:bg-wgc-gold-500 group-hover:text-wgc-navy-900 transition-colors shadow-sm">
                              <check.icon className="w-4 h-4" />
                           </div>
                           <span className="text-[10px] font-bold uppercase tracking-widest text-wgc-navy-900 font-mono">{check.text}</span>
                        </div>
                      ))}
                   </div>
                </section>
              </ScrollFade>

              {/* Internal Linking */}
              <ScrollFade>
                <section className="pt-16 border-t border-wgc-navy-50">
                   <h4 className="text-[10px] font-bold text-wgc-navy-400 uppercase tracking-[0.3em] mb-8 font-mono">Related Resources</h4>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <Link href="/resources/church-payment-processing-guide-2026" className="p-6 bg-white border border-wgc-navy-100 rounded-3xl hover:border-wgc-gold-300 transition-all group">
                         <p className="text-xs font-bold text-wgc-navy-900 uppercase tracking-widest mb-2 group-hover:text-wgc-gold-600 transition-colors">Core Processing Guide</p>
                         <p className="text-[10px] text-wgc-navy-400 font-medium opacity-80 leading-relaxed">Learn the fundamentals of card processing and ACH for 2026.</p>
                      </Link>
                      <Link href="/resources/white-label-payment-processing-nonprofit-church-software" className="p-6 bg-white border border-wgc-navy-100 rounded-3xl hover:border-wgc-gold-300 transition-all group">
                         <p className="text-xs font-bold text-wgc-navy-900 uppercase tracking-widest mb-2 group-hover:text-wgc-gold-600 transition-colors">White-Label Guide</p>
                         <p className="text-[10px] text-wgc-navy-400 font-medium opacity-80 leading-relaxed">Infrastructure and branding for nonprofit software platforms.</p>
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
