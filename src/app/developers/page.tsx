"use client";

import { useState } from "react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import CTASection from "@/components/ui/CTASection";
import ScrollFade from "@/components/ui/ScrollFade";
import { Shield, Zap, Code, Webhook, Database, Layout } from "lucide-react";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "introduction", label: "Introduction" },
  { id: "authentication", label: "Authentication" },
  { id: "merchants", label: "Merchant Onboarding" },
  { id: "payments", label: "Payments & Charges" },
  { id: "recurring", label: "Recurring Engine" },
  { id: "webhooks", label: "Webhooks" },
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
                  <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-wgc-gold-500/90 font-mono">Developer Reference</span>
                </div>
                <h1 className="text-5xl sm:text-6xl font-bold text-wgc-navy-900 mb-6 tracking-tight leading-tight">
                  WGC API<br /><span className="text-wgc-gold-500">Documentation</span>
                </h1>
                <p className="text-xl font-medium leading-relaxed mb-10 text-wgc-navy-500 tracking-tight">
                  The ministry infrastructure for church payments. Build embedded giving experiences directly into your platform — fully white-labeled.
                </p>
                <div className="flex flex-wrap gap-4">
                  {["REST API", "Live Webhooks", "Sandbox Ready"].map((tag) => (
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
                    <img 
                      src="/images/dev.png" 
                      alt="Developer Impact"
                      className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105 brightness-[1.02]"
                    />
                    
                    {/* Bottom: Solid Quote Bar */}
                    <div className="absolute bottom-0 left-0 right-0 bg-slate-950/90 backdrop-blur-md p-10 border-t border-white/10">
                      <div className="relative z-10 flex items-center gap-3 mb-6">
                        <div className="w-10 h-px bg-wgc-gold-500"></div>
                        <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-wgc-gold-500/70">Ministry Excellence</span>
                      </div>

                      <blockquote className="mb-6">
                        <p className="text-xl sm:text-2xl font-bold leading-snug italic mb-4 text-white tracking-tight">
                          &quot;Whatever you do, do it heartily, as to the Lord and not to men.&quot;
                        </p>
                        <footer className="text-wgc-gold-500/60 font-bold text-[11px] uppercase tracking-[0.2em] font-mono">
                          Colossians 3:23
                        </footer>
                      </blockquote>
                      
                      <div className="border-t border-white/10 pt-6">
                        <p className="text-[14px] font-medium leading-relaxed text-white/70 tracking-tight">
                          Every line of code directly enables the mission of the Church.
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
                      The WGC API is organized around REST. Our API has predictable resource-oriented URLs, accepts form-encoded request bodies, returns JSON-encoded responses, and uses standard HTTP response codes.
                    </p>
                    <p className="text-lg leading-relaxed">
                      All API requests must be made over HTTPS. Calls made over plain HTTP will fail. API requests without authentication will also fail.
                    </p>
                  </div>
                  <div className="bg-wgc-off rounded-[2rem] p-10 border border-wgc-navy-100 shadow-sm">
                    <div className="flex items-center gap-4 mb-6">
                      <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center">
                        <Shield className="w-5 h-5 text-wgc-gold-500" />
                      </div>
                      <h3 className="text-xl font-bold text-wgc-navy-900">Base Production URL</h3>
                    </div>
                    <div className="bg-white text-wgc-gold-500 rounded-2xl p-6 font-mono text-[14px] border border-wgc-navy-800 shadow-inner select-all break-all">
                      https://api.waypointgateway.com/api/v1
                    </div>
                  </div>
                </ScrollFade>
              </section>

              {/* Authentication */}
              <section id="authentication" className="scroll-mt-32 pt-20 border-t border-wgc-navy-100">
                <ScrollFade>
                  <h2 className="text-4xl font-bold text-wgc-navy-900 mb-8 tracking-tight">Authentication</h2>
                  <p className="text-lg text-wgc-navy-500 font-medium mb-10 leading-relaxed tracking-tight opacity-90">
                    Authenticate your account by including your secret API key in the request headers. Keep your keys secure — they carry full access to your partner account.
                  </p>
                  <div className="bg-white rounded-[2rem] overflow-hidden shadow-2xl border border-wgc-navy-800">
                    <div className="px-8 py-4 bg-white/5 border-b border-wgc-navy-100 flex items-center justify-between">
                      <span className="text-[10px] font-bold text-wgc-navy-400 uppercase tracking-widest font-mono">Authorization Header</span>
                      <div className="flex gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500/30"></div>
                        <div className="w-2.5 h-2.5 rounded-full bg-wgc-gold-500/30"></div>
                        <div className="w-2.5 h-2.5 rounded-full bg-green-500/30"></div>
                      </div>
                    </div>
                    <div className="p-8 font-mono text-[14px] text-white overflow-x-auto select-all bg-wgc-navy-950">
                      <span className="text-wgc-gold-500 font-bold tracking-tight">x-api-key:</span> wgc_live_YOUR_SECRET_KEY
                    </div>
                  </div>
                </ScrollFade>
              </section>

              {/* Merchant Onboarding */}
              <section id="merchants" className="scroll-mt-32 pt-20 border-t border-wgc-navy-100">
                <ScrollFade>
                  <div className="inline-flex items-center px-4 py-1 rounded-full text-wgc-gold-600 font-bold text-[10px] uppercase tracking-widest mb-6 border border-wgc-gold-500/30 bg-wgc-gold-500/5 font-mono">
                    POST /merchants/create
                  </div>
                  <h2 className="text-4xl font-bold text-wgc-navy-900 mb-8 tracking-tight">Onboard a Merchant</h2>
                  <p className="text-lg text-wgc-navy-500 font-medium mb-10 leading-relaxed tracking-tight opacity-90">
                    Creates a new merchant (Church or Nonprofit) identity within the WGC ecosystem. This step is required before you can process payments for a client.
                  </p>
                  <div className="grid lg:grid-cols-2 gap-8 mb-10">
                    <div className="bg-wgc-navy-950 rounded-[2rem] p-8 font-mono text-[13px] text-white border border-wgc-navy-800 shadow-xl overflow-auto">
                      <div className="text-wgc-navy-400 text-[10px] uppercase font-bold mb-4 tracking-widest">Request Body</div>
                      <pre>{`{
  "name": "First Baptist Church",
  "email": "admin@fbc.org"
}`}</pre>
                    </div>
                    <div className="rounded-[2.5rem] p-8 border border-wgc-gold-500/20 bg-wgc-gold-500/[0.02]">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-2 h-2 rounded-full bg-wgc-gold-500"></div>
                        <h4 className="text-sm font-bold text-wgc-navy-900 font-mono">Response Object</h4>
                      </div>
                      <div className="bg-white text-wgc-navy-900 rounded-2xl p-6 font-mono text-[13px] border border-wgc-navy-200 overflow-auto">
                        <pre>{`{
  "merchantId": "uuid-...",
  "status": "onboarding",
  "gatewayId": "ID_..."
}`}</pre>
                      </div>
                    </div>
                  </div>
                </ScrollFade>
              </section>

              {/* Payments */}
              <section id="payments" className="scroll-mt-32 pt-20 border-t border-wgc-navy-100">
                <ScrollFade>
                  <div className="inline-flex items-center px-4 py-1 rounded-full text-wgc-gold-600 font-bold text-[10px] uppercase tracking-widest mb-6 border border-wgc-gold-500/30 bg-wgc-gold-500/5 font-mono">
                    POST /payments/charge
                  </div>
                  <h2 className="text-4xl font-bold text-wgc-navy-900 mb-8 tracking-tight">One-time Charges</h2>
                  <p className="text-lg text-wgc-navy-500 font-medium mb-10 leading-relaxed tracking-tight opacity-90">
                    Process a single donation for a merchant using a pre-saved payment instrument (Card or ACH).
                  </p>
                  <div className="bg-wgc-navy-950 rounded-[2.5rem] p-10 font-mono text-[14px] text-white overflow-x-auto border border-wgc-navy-800 shadow-2xl mb-10">
                    <pre><span className="text-wgc-navy-400 font-bold italic tracking-tight opacity-60">// Charge the saved method</span>{`
{
  "amount": 150.00,
  "merchantId": "uuid-...",
  "donorName": "John Doe",
  "coverFee": true
}`}</pre>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="p-8 rounded-3xl bg-wgc-off border border-wgc-navy-100 shadow-sm">
                      <h4 className="font-bold text-wgc-navy-900 mb-4 tracking-tight">Card Settlements</h4>
                      <p className="text-[15px] text-wgc-navy-500 font-medium leading-relaxed tracking-tight opacity-90">
                        Ministry-grade card processing, capped at 2.3% + $0.25 per transaction. Rates reduce as volume grows.
                      </p>
                    </div>
                    <div className="p-8 rounded-3xl bg-wgc-off border border-wgc-navy-100 shadow-sm">
                      <h4 className="font-bold text-wgc-navy-900 mb-4 tracking-tight">ACH Transfer Rails</h4>
                      <p className="text-[15px] text-wgc-navy-500 font-medium leading-relaxed tracking-tight opacity-90">
                        ACH transfers feature a flat rate of 25¢, ideal for high-value tithes and pledges.
                      </p>
                    </div>
                  </div>
                </ScrollFade>
              </section>

              {/* Recurring Engine */}
              <section id="recurring" className="scroll-mt-32 pt-20 border-t border-wgc-navy-100">
                <ScrollFade>
                  <div className="inline-flex items-center px-4 py-1 rounded-full text-wgc-gold-600 font-bold text-[10px] uppercase tracking-widest mb-6 border border-wgc-gold-500/30 bg-wgc-gold-500/5 font-mono">
                    POST /recurring/create
                  </div>
                  <h2 className="text-4xl font-bold text-wgc-navy-900 mb-8 tracking-tight">Recurring Giving Engine</h2>
                  <p className="text-lg text-wgc-navy-500 font-medium mb-10 leading-relaxed tracking-tight opacity-90">
                    WGC features a native recurring engine that automatically processes gifts based on your defined intervals. You retain full control over pause/resume logic without managing complex cron jobs.
                  </p>
                  <div className="flex flex-col lg:flex-row gap-10">
                    <div className="lg:w-1/2 p-8 rounded-[2rem] bg-wgc-navy-950 border border-wgc-navy-800 shadow-2xl overflow-auto transition-transform hover:scale-[1.02]">
                       <pre className="font-mono text-[13px] text-white">{`{
  "amount": 200.00,
  "interval": "monthly",
  "merchantId": "...",
  "donorId": "..."
}`}</pre>
                    </div>
                    <div className="lg:w-1/2 flex items-start gap-6 p-8 rounded-[2rem] bg-wgc-gold-500/5 border border-wgc-gold-500/20">
                      <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg border border-wgc-gold-500/20">
                        <Zap className="w-6 h-6 text-wgc-gold-500" />
                      </div>
                      <div className="pt-1">
                        <h4 className="font-bold text-wgc-navy-900 mb-3 tracking-tight">Automated Processing</h4>
                        <p className="text-sm text-wgc-navy-500 font-medium leading-relaxed tracking-tight opacity-90">
                          Our scheduler runs daily at 00:00 UTC. Any donation whose <span className="font-mono font-bold text-wgc-navy-900 bg-wgc-navy-50 px-1 py-0.5 rounded">nextBillingDate</span> is today or in the past will be automatically triggered.
                        </p>
                      </div>
                    </div>
                  </div>
                </ScrollFade>
              </section>
            </main>
          </div>
        </div>
        
        {/* FINAL CTA */}
        <CTASection
          headline="Ready to build?"
          subheadline="Request a sandbox API key and start developing your white-labeled payment experience."
          ctaText="Request API Access"
          ctaLink="/contact"
        />
      </main>
      <Footer />
    </>
  );
}
