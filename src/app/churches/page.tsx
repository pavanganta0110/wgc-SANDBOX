import Link from "next/link";
import { CreditCard, Banknote, ShieldCheck, LayoutDashboard, Undo2, ArrowRightLeft } from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import FeatureCard from "@/components/ui/FeatureCard";
import CTASection from "@/components/ui/CTASection";
import ScrollFade from "@/components/ui/ScrollFade";

const CHURCH_FEATURES = [
  {
    icon: CreditCard,
    title: "Card and ACH donations",
    description: "Accept all major credit cards and low-cost ACH bank transfers directly from your donors.",
  },
  {
    icon: ShieldCheck,
    title: "Secure Finix onboarding",
    description: "Our PCI Level 1 compliant onboarding process ensures your organization's data is verified securely and swiftly.",
  },
  {
    icon: LayoutDashboard,
    title: "Sub-merchant dashboard",
    description: "Get direct access to your dedicated Finix portal for complete transparency over your operations.",
  },
  {
    icon: ArrowRightLeft,
    title: "Payouts & deposits",
    description: "Track exactly when your donations settle and land in your organization's payout bank account.",
  },
  {
    icon: Undo2,
    title: "Refunds & disputes",
    description: "Easily issue refunds or handle chargeback disputes directly from the sub-merchant dashboard.",
  },
  {
    icon: Banknote,
    title: "Transparent pricing",
    description: "No hidden fees. A flat stewardship-first rate to ensure more money stays within the ministry.",
  },
];

export default function ChurchesPage() {
  return (
    <>
      <Header />
      <main className="flex-grow">
        {/* HERO SECTION */}
        <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 overflow-hidden bg-wgc-navy-950">
          <div className="absolute inset-0 z-0">
            <div className="absolute inset-0 bg-wgc-navy-950/90 mix-blend-multiply z-10"></div>
            {/* Subtle decorative grid */}
            <svg className="absolute left-0 top-0 h-full w-full opacity-[0.03]" xmlns="http://www.wgctailwind.svg">
              <defs>
                <pattern id="grid-pattern-hero" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M0 40V0h40" fill="none" stroke="currentColor" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid-pattern-hero)" />
            </svg>
            {/* Gold glow */}
            <div className="absolute -top-48 -right-48 w-96 h-96 bg-wgc-gold-500/20 blur-[100px] rounded-full"></div>
            <div className="absolute top-1/2 left-1/4 w-64 h-64 bg-[#eab308]/10 blur-[80px] rounded-full"></div>
          </div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-20">
            <div className="text-center max-w-4xl mx-auto">
              <ScrollFade>
                <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-white mb-8 leading-[1.1]">
                  Payment rails for <span className="text-wgc-gold-500 italic font-playfair pr-2">churches</span> and nonprofits
                </h1>
                <p className="text-lg md:text-xl text-white/80 max-w-2xl mx-auto mb-10 leading-relaxed">
                  WGC Payments helps churches and nonprofits accept digital donations through our secure Finix-powered onboarding and payment infrastructure.
                </p>
                <div className="flex flex-col sm:flex-row justify-center gap-6">
                  <Link href="/start" className="metallic-gold inline-flex items-center justify-center px-10 py-5 text-[13px] font-bold rounded-2xl transition-all shadow-2xl hover:-translate-y-1 tracking-wide">
                    Start Onboarding
                  </Link>
                </div>
              </ScrollFade>
            </div>
          </div>
        </section>

        {/* FEATURES SECTION */}
        <section className="py-24 bg-wgc-off relative">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-wgc-navy-900 mb-4">
                Everything your ministry needs
              </h2>
              <p className="text-wgc-navy-400">
                A complete payment ecosystem designed to facilitate generous giving without the headache of legacy processors.
              </p>
            </div>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {CHURCH_FEATURES.map((feature, idx) => (
                <ScrollFade key={feature.title} delay={idx * 0.1}>
                  <FeatureCard 
                    icon={feature.icon}
                    title={feature.title}
                    description={feature.description}
                  />
                </ScrollFade>
              ))}
            </div>
          </div>
        </section>

        {/* CTA SECTION */}
        <CTASection 
          headline="Ready to streamline giving?"
          subheadline="Join the churches and nonprofits utilizing our robust payment infrastructure."
          ctaText="Start Onboarding"
          ctaLink="/start"
        />
      </main>
      <Footer />
    </>
  );
}
