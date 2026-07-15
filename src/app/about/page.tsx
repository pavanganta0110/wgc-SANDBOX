import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import CTASection from "@/components/ui/CTASection";
import ScrollFade from "@/components/ui/ScrollFade";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About WGC | Why We Built Payments for Ministries",
  description: "Learn why WGC exists — purpose-built payment infrastructure helping ministries and the software that serves them steward resources better.",
  openGraph: {
    title: "About WGC | Why We Built Payments for Ministries",
    description: "Learn why WGC exists — purpose-built payment infrastructure helping ministries and the software that serves them steward resources better.",
    url: "https://www.wgcpayments.com/about",
  },
};


const PILLARS = [
  {
    emoji: "🙏",
    title: "Kingdom alignment",
    description: "We exist to serve the church, not to extract profit from it. Every policy and fee is designed with the mission in mind.",
  },
  {
    emoji: "🔒",
    title: "Radical transparency",
    description: "No hidden fees. No lock-in. A transferable merchant vault. Your merchants trust you — we help you maintain that trust completely.",
  },
  {
    emoji: "⚡",
    title: "Software-first design",
    description: "We don't compete with you. We power you. WGC is infrastructure — invisible to donors, indispensable to your roadmap.",
  },
];

export default function AboutPage() {
  return (
    <>
      <Header />
      <main className="flex-grow">
        {/* DARK HERO */}
        <section className="relative bg-wgc-off pt-32 pb-24 overflow-hidden border-b border-wgc-navy-800">
          <div className="absolute inset-0 opacity-[0.04]">
            <svg className="w-full h-full" fill="none">
              <pattern id="about-grid" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
                <path d="M 28 0 L 0 0 0 28" fill="none" stroke="white" strokeWidth="0.5" />
              </pattern>
              <rect width="100%" height="100%" fill="url(#about-grid)" />
            </svg>
          </div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.03] pointer-events-none select-none text-[20rem] font-bold text-wgc-gold-500 leading-none">✝</div>

          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
            <ScrollFade>
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-8 border border-wgc-gold-500/30 bg-wgc-gold-500/10">
                <div className="w-1.5 h-1.5 rounded-full bg-wgc-gold-500"></div>
                <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-wgc-gold-500/90 font-mono">Our Foundation</span>
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05] mb-6 text-wgc-navy-900">
                Why WGC <span className="text-wgc-gold-500">exists</span>
              </h1>
              <p className="text-xl font-medium leading-relaxed max-w-2xl mx-auto text-wgc-navy-500 tracking-tight">
                Empowering churches, nonprofits, and their software with faith-aligned, white-label payment infrastructure.
              </p>
            </ScrollFade>
          </div>
        </section>

        {/* MISSION */}
        <section className="py-28 bg-white border-b border-wgc-navy-100">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <ScrollFade>
              <h2 className="text-4xl sm:text-5xl font-bold text-wgc-navy-900 tracking-tight mb-8">Purpose-Built Infrastructure</h2>
              <p className="text-xl leading-relaxed text-wgc-navy-500 font-medium mb-6 tracking-tight opacity-90">
                Way Point Gateway Collective was founded on a simple belief: the software tools that serve the Church deserve payment infrastructure that shares their mission and preserves their values.
              </p>
              <p className="text-lg leading-relaxed text-wgc-navy-500 font-medium mb-10 tracking-tight opacity-80">
                We&apos;re building WGC to empower software companies that already love and serve churches — giving them the tools to process donations, manage merchants, and scale securely without being distracted by technical debt or regulatory complexity.
              </p>
              <div className="bg-wgc-off rounded-3xl p-10 text-left relative overflow-hidden border border-wgc-gold-500/20">
                <div className="absolute -bottom-4 -right-4 opacity-[0.05] pointer-events-none select-none text-[10rem] font-bold text-wgc-gold-500 leading-none">✝</div>
                <div className="w-10 h-1 rounded-full mb-6 bg-gradient-to-r from-wgc-gold-500 to-amber-600"></div>
                <p className="text-2xl font-bold italic leading-snug relative z-10 text-wgc-navy-900">
                  &quot;We handle the infrastructure. You build the experience. Together, we move more resources toward the Kingdom.&quot;
                </p>
                <div className="mt-6 flex items-center gap-3">
                  <div className="w-6 h-px bg-wgc-gold-500/50"></div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-wgc-gold-500 font-mono">WGC Mission</span>
                </div>
              </div>
            </ScrollFade>
          </div>
        </section>

        {/* PILLARS */}
        <section className="py-28 bg-wgc-off border-b border-wgc-navy-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <ScrollFade>
              <div className="text-center mb-16">
                <h2 className="text-4xl sm:text-5xl font-bold text-wgc-navy-900 tracking-tight mb-4">Our Core Commitments</h2>
                <p className="text-lg text-wgc-navy-500 font-medium max-w-2xl mx-auto tracking-tight opacity-90">These aren&apos;t just values — they&apos;re the principles that shape every API decision we make.</p>
              </div>
            </ScrollFade>
            <div className="grid md:grid-cols-3 gap-8">
              {PILLARS.map((pillar, i) => (
                <ScrollFade key={pillar.title} delay={i * 120}>
                  <div className="bg-white rounded-3xl p-10 border border-wgc-navy-100 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all h-full">
                    <div className="w-14 h-14 rounded-2xl bg-wgc-gold-500/10 flex items-center justify-center mb-8 border border-wgc-gold-500/20">
                      <span className="text-2xl">{pillar.emoji}</span>
                    </div>
                    <h3 className="text-xl font-bold text-wgc-navy-900 mb-3 tracking-tight">{pillar.title}</h3>
                    <p className="text-wgc-navy-500 font-medium leading-relaxed tracking-tight opacity-80">{pillar.description}</p>
                  </div>
                </ScrollFade>
              ))}
            </div>
          </div>
        </section>

        {/* SCRIPTURE */}
        <section className="relative py-32 overflow-hidden bg-slate-950">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.04] pointer-events-none select-none text-[20rem] font-bold text-wgc-gold-500 leading-none">✝</div>
          <div className="relative z-10 max-w-3xl mx-auto px-4 text-center">
            <ScrollFade>
              <div className="w-16 h-1 rounded-full mx-auto mb-10 bg-gradient-to-r from-wgc-gold-500 to-amber-600"></div>
              <blockquote className="space-y-12">
                <p className="text-3xl sm:text-4xl font-bold italic leading-snug text-slate-50">
                  &quot;Then Samuel took a stone and set it up between Mizpah and Shen and called its name Ebenezer; for he said, &apos;Till now the LORD has helped us.&apos;&quot;
                </p>
                <footer className="flex items-center justify-center gap-4">
                  <div className="w-8 h-px bg-wgc-gold-500/50"></div>
                  <span className="text-[11px] font-bold uppercase tracking-widest text-wgc-gold-500 font-mono">1 Samuel 7:12 — Our Foundation</span>
                  <div className="w-8 h-px bg-wgc-gold-500/50"></div>
                </footer>
              </blockquote>
            </ScrollFade>
          </div>
        </section>

        {/* CTA */}
        <CTASection
          headline="Partner with us"
          subheadline="Join the movement of software companies building the future of Kingdom giving."
          ctaText="Get In Touch"
          ctaLink="/contact"
        />
      </main>
      <Footer />
    </>
  );
}
