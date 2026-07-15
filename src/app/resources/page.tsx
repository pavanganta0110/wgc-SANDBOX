import Link from "next/link";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ScrollFade from "@/components/ui/ScrollFade";
import { BookOpen, Newspaper, Shield, CreditCard, ArrowRight } from "lucide-react";

const RESOURCES = [
  {
    title: "Best Payment Processor for Churches in 2026",
    description: "Learn how church payment processing works in 2026, including card fees, ACH transfers, and recurring giving.",
    href: "/resources/church-payment-processing-guide-2026",
    icon: CreditCard,
    tag: "Market Research"
  },
  {
    title: "How to White-Label Payments for Nonprofit Software",
    description: "Explore how white-label payment processing helps nonprofit and church software platforms offer branded onboarding.",
    href: "/resources/white-label-payment-processing-nonprofit-church-software",
    icon: Shield,
    tag: "Architecture"
  },
  {
    title: "Stripe vs Tithe.ly vs WGC: Fee Breakdown",
    description: "Understand church payment processing pricing, including card transactions, ACH support, and monthly costs.",
    href: "/resources/church-payment-processing-pricing-guide",
    icon: Newspaper,
    tag: "Finance"
  }
];

export default function ResourcesPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen bg-white">
        {/* HERO */}
        <section className="relative bg-white pt-32 pb-24 overflow-hidden border-b border-wgc-navy-800">
          <div className="absolute inset-0 opacity-[0.04] pointer-events-none">
            <svg className="w-full h-full" fill="none">
              <pattern id="resources-grid" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
                <path d="M 32 0 L 0 0 0 32" fill="none" stroke="white" strokeWidth="0.5" />
              </pattern>
              <rect width="100%" height="100%" fill="url(#resources-grid)" />
            </svg>
          </div>
          
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
            <ScrollFade>
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-8 border border-wgc-gold-500/30 bg-wgc-gold-500/10 font-mono">
                <BookOpen className="w-3 h-3 text-wgc-gold-500" />
                <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-wgc-gold-500/90">WGC Knowledge Base</span>
              </div>
              <h1 className="text-4xl sm:text-6xl font-bold tracking-tight leading-[1.05] mb-6 text-wgc-navy-900">
                Stewardship <span className="text-wgc-gold-500">Resources</span>
              </h1>
              <p className="text-xl font-medium leading-relaxed max-w-2xl mx-auto text-wgc-navy-200 tracking-tight opacity-90">
                Insights, guides, and technical briefings for church software partners and ministry leaders.
              </p>
            </ScrollFade>
          </div>
        </section>

        {/* RESOURCE GRID */}
        <section className="py-24 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {RESOURCES.map((res) => (
                <Link key={res.href} href={res.href} className="group">
                  <ScrollFade>
                    <div className="bg-wgc-off rounded-[2.5rem] p-10 border border-wgc-navy-100 h-full flex flex-col transition-all hover:shadow-2xl hover:shadow-wgc-navy-950/5 hover:-translate-y-1 group-hover:border-wgc-gold-500/20">
                      <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center text-wgc-gold-500 mb-8 shadow-lg border border-wgc-navy-50 transition-transform group-hover:scale-110">
                        <res.icon className="w-6 h-6" />
                      </div>
                      <div className="mb-4">
                        <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-wgc-gold-600 font-mono">{res.tag}</span>
                      </div>
                      <h3 className="text-xl font-bold text-wgc-navy-900 mb-4 tracking-tight leading-tight group-hover:text-wgc-gold-600 transition-colors">{res.title}</h3>
                      <p className="text-sm text-wgc-navy-500 tracking-tight opacity-80 leading-relaxed flex-grow">{res.description}</p>
                      <div className="mt-10 flex items-center gap-2 text-[10px] font-bold text-wgc-navy-900 uppercase tracking-[0.2em] font-mono group-hover:gap-4 transition-all">
                        Read Guide <ArrowRight className="w-4 h-4 text-wgc-gold-600" />
                      </div>
                    </div>
                  </ScrollFade>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
