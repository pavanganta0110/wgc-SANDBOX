import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ScrollFade from "@/components/ui/ScrollFade";
import { ShieldCheck, Landmark, Lock } from "lucide-react";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Security & Compliance | WGC",
  description: "Details on WGC's PCI Level 1 compliance, security practices, and audited payment protocols.",
  openGraph: {
    title: "Security & Compliance | WGC",
    description: "Details on WGC's PCI Level 1 compliance, security practices, and audited payment protocols.",
    url: "https://www.wgcpayments.com/legal/compliance",
  },
};


export default function CompliancePage() {
  return (
    <>
      <Header />
      <main className="min-h-screen bg-white">
        {/* MINISTRY HERO */}
        <section className="relative bg-white pt-32 pb-24 overflow-hidden border-b border-wgc-navy-800">
          <div className="absolute inset-0 opacity-[0.04] pointer-events-none">
            <svg className="w-full h-full" fill="none">
              <pattern id="compliance-grid" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
                <path d="M 32 0 L 0 0 0 32" fill="none" stroke="white" strokeWidth="0.5" />
              </pattern>
              <rect width="100%" height="100%" fill="url(#compliance-grid)" />
            </svg>
          </div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.03] pointer-events-none select-none text-[20rem] font-bold text-wgc-gold-500 leading-none">✝</div>

          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
            <ScrollFade>
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-8 border border-wgc-gold-500/30 bg-wgc-gold-500/10 font-mono">
                <ShieldCheck className="w-3 h-3 text-wgc-gold-500" />
                <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-wgc-gold-500/90">Ministry Protocol</span>
              </div>
              <h1 className="text-4xl sm:text-6xl font-bold tracking-tight leading-[1.05] mb-6 text-wgc-navy-900">
                Security & <span className="text-wgc-gold-500">Compliance</span>
              </h1>
              <p className="text-xl font-medium leading-relaxed max-w-2xl mx-auto text-wgc-navy-200 tracking-tight">
                Bank-grade infrastructure meets Kingdom-focused stewardship. We manage the complexity of global payment rails so you can focus on the mission.
              </p>
            </ScrollFade>
          </div>
        </section>

        {/* MAIN CONTENT */}
        <section className="py-24 bg-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <ScrollFade>
              {/* Core Pillars */}
              <div className="grid md:grid-cols-2 gap-8 mb-24">
                <div className="bg-wgc-off rounded-3xl p-8 border border-wgc-navy-100 shadow-sm transition-transform hover:-translate-y-1">
                  <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center mb-6 shadow-lg border border-wgc-gold-500/20">
                    <Landmark className="w-6 h-6 text-wgc-gold-500" />
                  </div>
                  <h3 className="text-xl font-bold text-wgc-navy-900 mb-3 tracking-tight">PCI Level 1 Certified</h3>
                  <p className="text-wgc-navy-600 font-medium leading-relaxed tracking-tight opacity-90">
                    WGC maintains the highest level of Payment Card Industry Data Security Standard certification. Your data, and your donors&apos; data, is protected by ministry-grade encryption layers.
                  </p>
                </div>
                <div className="bg-wgc-off rounded-3xl p-8 border border-wgc-navy-100 shadow-sm transition-transform hover:-translate-y-1">
                  <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center mb-6 shadow-lg border border-wgc-gold-500/20">
                    <Lock className="w-6 h-6 text-wgc-gold-500" />
                  </div>
                  <h3 className="text-xl font-bold text-wgc-navy-900 mb-3 tracking-tight">AES-256 Encryption</h3>
                  <p className="text-wgc-navy-600 font-medium leading-relaxed tracking-tight opacity-90">
                    All sensitive financial information is encrypted at rest and in transit. We use hardware security modules (HSMs) to manage keys and ensure absolute vault integrity.
                  </p>
                </div>
              </div>

              <div className="text-wgc-navy-900 space-y-16 tracking-tight opacity-90">
                <div className="flex items-center gap-4 mb-10">
                  <div className="w-1.5 h-10 bg-wgc-gold-500 rounded-full"></div>
                  <h2 className="text-3xl font-bold tracking-tight m-0">Compliance Framework</h2>
                </div>

                <div className="space-y-12 transition-all">
                  <section>
                    <h3 className="text-[13px] font-bold text-wgc-gold-600 uppercase tracking-[0.2em] mb-4 font-mono">01. Data Sovereignty</h3>
                    <p className="leading-relaxed">
                      We believe software partners should own their merchant relationships. WGC operates a <strong>Transferable Merchant Vault</strong>, ensuring you are never locked in. Your data belongs to you, and we facilitate secure, PCI-compliant exports whenever required.
                    </p>
                  </section>

                  <section>
                    <h3 className="text-[13px] font-bold text-wgc-gold-600 uppercase tracking-[0.2em] mb-4 font-mono">02. AML/KYC Orchestration</h3>
                    <p className="leading-relaxed">
                      Our platform features built-in Anti-Money Laundering (AML) and Know Your Customer (KYC) protocols tailored for the nonprofit sector. We verify identities and monitor for fraudulent activity while maintaining the white-label experience of your software.
                    </p>
                  </section>

                  <section>
                    <h3 className="text-[13px] font-bold text-wgc-gold-600 uppercase tracking-[0.2em] mb-4 font-mono">03. Network Security</h3>
                    <p className="leading-relaxed">
                      System access is strictly controlled via multi-factor authentication (MFA) and granular API scopes. We perform regular penetration testing and vulnerability assessments to ensure the WGC network remains an unshakeable foundation for your business.
                    </p>
                  </section>
                </div>

                {/* Documentation Link */}
                <div className="mt-24 p-10 bg-white rounded-[2.5rem] border border-wgc-navy-800 relative overflow-hidden group">
                  <div className="absolute -bottom-6 -right-6 opacity-[0.05] pointer-events-none select-none transition-transform duration-1000 group-hover:scale-110 text-[12rem] font-bold text-wgc-gold-500 leading-none">✝</div>
                  <div className="relative z-10">
                    <h3 className="text-2xl font-bold text-wgc-navy-900 mb-4 tracking-tight">Ready for Audit?</h3>
                    <p className="text-wgc-navy-300 mb-8 max-w-lg font-medium opacity-80">
                      Our security documentation and PCI Attestation of Compliance (AOC) are available to partners upon request.
                    </p>
                    <button className="bg-wgc-gold-500 text-wgc-navy-900 px-8 py-3 rounded-xl text-[11px] font-bold uppercase tracking-widest hover:bg-white transition-all active:scale-95 shadow-xl">
                      Request Documentation
                    </button>
                  </div>
                </div>
              </div>
            </ScrollFade>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
