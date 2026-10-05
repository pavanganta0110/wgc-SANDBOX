"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import CTASection from "@/components/ui/CTASection";
import ScrollFade from "@/components/ui/ScrollFade";
import { Shield, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "introduction", label: "Introduction" },
  { id: "authentication", label: "Authentication" },
  { id: "merchants", label: "Merchant Onboarding" },
  { id: "payments", label: "Payments & Charges" },
  { id: "recurring", label: "Recurring Engine" },
];

export default function DevelopersPage() {
  const [activeSection, setActiveSection] = useState("introduction");

  const scrollTo = (id: string) => {
    setActiveSection(id);
    const element = document.getElementById(id);
    if (element) {
      const offset = 100; // Account for sticky header
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      });
    }
  };

  return (
    <>
      <Header />
      <main className="min-h-screen bg-white pb-24">
        {/* DARK HERO */}
        <section className="bg-wgc-off pt-32 pb-24 border-b border-wgc-navy-800 relative overflow-hidden">
          <div className="absolute inset-0 opacity-[0.04] pointer-events-none">
            <svg className="w-full h-full" fill="none">
              <pattern id="dev-hero-grid" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
                <path d="M 32 0 L 0 0 0 32" fill="none" stroke="white" strokeWidth="0.5" />
              </pattern>
              <rect width="100%" height="100%" fill="url(#dev-hero-grid)" />
            </svg>
          </div>
          <div className="absolute top-1/2 right-0 -translate-y-1/2 w-96 h-96 rounded-full blur-3xl opacity-10 pointer-events-none" style={{ background: "radial-gradient(circle, #eab308 0%, transparent 70%)" }}></div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <div className="lg:grid lg:grid-cols-2 lg:gap-16 items-center">
              <ScrollFade>
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-8 border border-wgc-gold-500/30 bg-wgc-gold-500/10">
                  <div className="w-1.5 h-1.5 rounded-full bg-wgc-gold-500"></div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-wgc-gold-500/90 font-mono">For Software Partners</span>
                </div>
                <h1 className="text-5xl sm:text-6xl font-bold text-wgc-navy-900 mb-6 tracking-tight leading-tight">
                  WGC Platform<br /><span className="text-wgc-gold-500">Architecture</span>
                </h1>
                <p className="text-xl font-medium leading-relaxed mb-10 text-wgc-navy-500 tracking-tight">
                  Payment infrastructure for nonprofit and 501(c) organization software. Today, we integrate approved software partners through a guided, hands-on process — self-serve API access is on our roadmap.
                </p>
                <div className="flex flex-wrap gap-4">
                  {["Guided Integration", "REST-Based", "Roadmap: Self-Serve API"].map((tag) => (
                    <div key={tag} className="flex items-center gap-3 px-5 py-3 rounded-xl border border-wgc-gold-500/30 bg-wgc-gold-500/5">
                      <div className="w-2 h-2 rounded-full bg-wgc-gold-500"></div>
                      <span className="text-[11px] font-bold uppercase tracking-widest text-wgc-navy-600 font-mono">{tag}</span>
                    </div>
                  ))}
                </div>
              </ScrollFade>

              <ScrollFade delay={200}>
                <div className="mt-16 lg:mt-0 relative group">
                  <div className="relative rounded-[3rem] overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-white/10 aspect-[4/5] lg:aspect-auto lg:h-[600px]">
                    <Image
                      src="/images/dev.webp"
                      alt="Developer Impact"
                      fill
                      sizes="(max-width: 1024px) 100vw, 45vw"
                      className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105 brightness-[1.02]"
                    />
                    
                    {/* Bottom: Solid Quote Bar */}
                    <div className="absolute bottom-0 left-0 right-0 bg-slate-950/90 backdrop-blur-md p-10 border-t border-white/10">
                      <div className="relative z-10 flex items-center gap-3 mb-6">
                        <div className="w-10 h-px bg-wgc-gold-500"></div>
                        <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-wgc-gold-500/70">Built for Purpose</span>
                      </div>

                      <blockquote className="mb-6">
                        <p className="text-xl sm:text-2xl font-bold leading-snug italic mb-4 text-white tracking-tight">
                          &quot;Every integration directly enables the mission of the organizations your platform serves.&quot;
                        </p>
                      </blockquote>

                      <div className="border-t border-white/10 pt-6">
                        <p className="text-[14px] font-medium leading-relaxed text-white/70 tracking-tight">
                          Built specifically for software that serves nonprofits, churches, and other 501(c) organizations.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </ScrollFade>
            </div>
          </div>
        </section>

        {/* MAIN CONTENT */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          {/* Mobile Documentation Navigation */}
          <div className="lg:hidden mb-12 overflow-x-auto pb-4 -mx-4 px-4 sticky top-20 bg-white z-20 border-b border-wgc-navy-50">
            <div className="flex gap-4 min-w-max">
              {SECTIONS.map((section) => (
                <button
                  key={section.id}
                  onClick={() => scrollTo(section.id)}
                  className={cn(
                    "px-5 py-2.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all font-mono",
                    activeSection === section.id ? "bg-white text-wgc-navy-900" : "bg-wgc-navy-50 text-wgc-navy-600"
                  )}
                >
                  {section.label}
                </button>
              ))}
            </div>
          </div>

          <div className="lg:grid lg:grid-cols-12 lg:gap-16">
            {/* Sticky Sidebar Navigation (Desktop Only) */}
            <aside className="hidden lg:block lg:col-span-3">
              <nav className="sticky top-32 space-y-2">
                <p className="text-[10px] font-bold text-wgc-navy-300 uppercase tracking-widest mb-6 px-4 font-mono">Documentation</p>
                {SECTIONS.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => scrollTo(section.id)}
                    className={cn(
                      "w-full text-left px-4 py-3 text-sm font-bold tracking-tight transition-all rounded-r-xl border-l-4",
                      activeSection === section.id
                        ? "bg-wgc-navy-50 text-wgc-navy-900 border-wgc-gold-500"
                        : "text-wgc-navy-500 border-transparent hover:bg-wgc-navy-50 hover:text-wgc-navy-900"
                    )}
                  >
                    {section.label}
                  </button>
                ))}
              </nav>
            </aside>

            {/* Main Content */}
            <main className="lg:col-span-9 space-y-16 md:space-y-24">
              {/* Introduction */}
              <section id="introduction" className="scroll-mt-32">
                <ScrollFade>
                  <h2 className="text-4xl font-bold text-wgc-navy-900 mb-8 tracking-tight">Introduction</h2>
                  <div className="text-wgc-navy-600 font-medium mb-10 space-y-6 tracking-tight opacity-90">
                    <p className="text-lg leading-relaxed">
                      WGC&apos;s payment infrastructure is built around REST principles — predictable, resource-oriented endpoints and JSON responses. Today, we integrate approved software partners directly, working with your team to connect merchant onboarding, payments, and recurring giving into your platform.
                    </p>
                    <p className="text-lg leading-relaxed">
                      Self-serve API keys and public documentation are on our roadmap. If you&apos;re a software platform serving nonprofits and want to embed WGC now,{" "}
                      <Link href="/contact" className="text-wgc-gold-600 font-bold hover:underline">reach out</Link> and we&apos;ll walk you through what&apos;s possible today.
                    </p>
                  </div>
                  <div className="bg-wgc-off rounded-[2rem] p-10 border border-wgc-navy-100 shadow-sm">
                    <div className="flex items-center gap-4 mb-6">
                      <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center">
                        <Shield className="w-5 h-5 text-wgc-gold-500" />
                      </div>
                      <h3 className="text-xl font-bold text-wgc-navy-900">How partner integrations work today</h3>
                    </div>
                    <p className="text-[15px] text-wgc-navy-600 font-medium leading-relaxed">
                      Rather than a public, self-serve API, WGC currently onboards software partners through a guided process: we scope your integration, connect merchant onboarding and payment flows on our side, and support you through launch. This keeps every integration PCI-compliant and correctly configured from day one.
                    </p>
                  </div>
                </ScrollFade>
              </section>

              {/* Authentication */}
              <section id="authentication" className="scroll-mt-32 pt-20 border-t border-wgc-navy-100">
                <ScrollFade>
                  <h2 className="text-4xl font-bold text-wgc-navy-900 mb-8 tracking-tight">Authentication &amp; Access</h2>
                  <p className="text-lg text-wgc-navy-500 font-medium mb-10 leading-relaxed tracking-tight opacity-90">
                    Approved software partners are issued dedicated, scoped access as part of onboarding. Self-serve API keys — generated instantly from a partner dashboard — are on our roadmap, not available today.
                  </p>
                  <div className="bg-white rounded-[2rem] overflow-hidden shadow-2xl border border-wgc-navy-800">
                    <div className="px-8 py-4 bg-white/5 border-b border-wgc-navy-100 flex items-center justify-between">
                      <span className="text-[10px] font-bold text-wgc-navy-400 uppercase tracking-widest font-mono">Roadmap</span>
                      <div className="flex gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500/30"></div>
                        <div className="w-2.5 h-2.5 rounded-full bg-wgc-gold-500/30"></div>
                        <div className="w-2.5 h-2.5 rounded-full bg-green-500/30"></div>
                      </div>
                    </div>
                    <div className="p-8 font-mono text-[14px] text-white overflow-x-auto bg-wgc-navy-950">
                      <span className="text-wgc-gold-500 font-bold tracking-tight">Coming soon:</span> self-serve API keys for approved software partners
                    </div>
                  </div>
                </ScrollFade>
              </section>

              {/* Merchant Onboarding */}
              <section id="merchants" className="scroll-mt-32 pt-20 border-t border-wgc-navy-100">
                <ScrollFade>
                  <div className="inline-flex items-center px-4 py-1 rounded-full text-wgc-gold-600 font-bold text-[10px] uppercase tracking-widest mb-6 border border-wgc-gold-500/30 bg-wgc-gold-500/5 font-mono">
                    Partner-Guided
                  </div>
                  <h2 className="text-4xl font-bold text-wgc-navy-900 mb-8 tracking-tight">Onboarding an Organization</h2>
                  <p className="text-lg text-wgc-navy-500 font-medium mb-10 leading-relaxed tracking-tight opacity-90">
                    Every organization (church, nonprofit, or other 501(c) entity) goes through underwriting before it can process payments. For software partners, we work with you to connect your platform&apos;s signup flow into WGC&apos;s onboarding process.
                  </p>
                </ScrollFade>
              </section>

              {/* Payments */}
              <section id="payments" className="scroll-mt-32 pt-20 border-t border-wgc-navy-100">
                <ScrollFade>
                  <div className="inline-flex items-center px-4 py-1 rounded-full text-wgc-gold-600 font-bold text-[10px] uppercase tracking-widest mb-6 border border-wgc-gold-500/30 bg-wgc-gold-500/5 font-mono">
                    Cards & ACH
                  </div>
                  <h2 className="text-4xl font-bold text-wgc-navy-900 mb-8 tracking-tight">One-Time Payments</h2>
                  <p className="text-lg text-wgc-navy-500 font-medium mb-10 leading-relaxed tracking-tight opacity-90">
                    Process a single donation or payment by card or ACH bank transfer, with the option for the donor to cover the processing fee.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="p-8 rounded-3xl bg-wgc-off border border-wgc-navy-100 shadow-sm">
                      <h4 className="font-bold text-wgc-navy-900 mb-4 tracking-tight">Card Processing</h4>
                      <p className="text-[15px] text-wgc-navy-500 font-medium leading-relaxed tracking-tight opacity-90">
                        Capped at 2.3% + $0.25 per transaction.
                      </p>
                    </div>
                    <div className="p-8 rounded-3xl bg-wgc-off border border-wgc-navy-100 shadow-sm">
                      <h4 className="font-bold text-wgc-navy-900 mb-4 tracking-tight">ACH Transfer</h4>
                      <p className="text-[15px] text-wgc-navy-500 font-medium leading-relaxed tracking-tight opacity-90">
                        A flat rate of 25¢, ideal for high-value gifts and pledges.
                      </p>
                    </div>
                  </div>
                </ScrollFade>
              </section>

              {/* Recurring Engine */}
              <section id="recurring" className="scroll-mt-32 pt-20 border-t border-wgc-navy-100">
                <ScrollFade>
                  <div className="inline-flex items-center px-4 py-1 rounded-full text-wgc-gold-600 font-bold text-[10px] uppercase tracking-widest mb-6 border border-wgc-gold-500/30 bg-wgc-gold-500/5 font-mono">
                    Native Recurring
                  </div>
                  <h2 className="text-4xl font-bold text-wgc-navy-900 mb-8 tracking-tight">Recurring Giving Engine</h2>
                  <p className="text-lg text-wgc-navy-500 font-medium mb-10 leading-relaxed tracking-tight opacity-90">
                    WGC&apos;s recurring engine automatically processes gifts on the interval a donor sets — monthly, annual, or a fixed number of installments — without your platform managing the billing schedule.
                  </p>
                  <div className="flex items-start gap-6 p-8 rounded-[2rem] bg-wgc-gold-500/5 border border-wgc-gold-500/20">
                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg border border-wgc-gold-500/20">
                      <Zap className="w-6 h-6 text-wgc-gold-500" />
                    </div>
                    <div className="pt-1">
                      <h4 className="font-bold text-wgc-navy-900 mb-3 tracking-tight">Automated Processing</h4>
                      <p className="text-sm text-wgc-navy-500 font-medium leading-relaxed tracking-tight opacity-90">
                        Recurring gifts are automatically charged on schedule, with pause/resume support and no manual intervention required from your team.
                      </p>
                    </div>
                  </div>
                </ScrollFade>
              </section>
            </main>
          </div>
        </div>
        
        {/* FINAL CTA */}
        <CTASection
          headline="Ready to talk integration?"
          subheadline="Tell us about your platform and we'll walk you through what a WGC integration looks like today."
          ctaText="Talk to Our Team"
          ctaLink="/contact"
        />
      </main>
      <Footer />
    </>
  );
}
