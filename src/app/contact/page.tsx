import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ScrollFade from "@/components/ui/ScrollFade";
import { Mail } from "lucide-react";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact WGC | Talk to Our Payments Team",
  description: "Get in touch with WGC to discuss embedded payments, partnerships, or onboarding for your church or nonprofit software platform.",
  openGraph: {
    title: "Contact WGC | Talk to Our Payments Team",
    description: "Get in touch with WGC to discuss embedded payments, partnerships, or onboarding for your church or nonprofit software platform.",
    url: "https://www.wgcpayments.com/contact",
  },
};


export default function ContactPage() {
  return (
    <>
      <Header />
      <main className="flex-grow">
        {/* DARK HERO */}
        <section className="relative bg-wgc-off pt-32 pb-24 overflow-hidden border-b border-wgc-navy-800">
          <div className="absolute inset-0 opacity-[0.04]">
            <svg className="w-full h-full" fill="none">
              <pattern id="contact-hero-grid" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
                <path d="M 28 0 L 0 0 0 28" fill="none" stroke="white" strokeWidth="0.5" />
              </pattern>
              <rect width="100%" height="100%" fill="url(#contact-hero-grid)" />
            </svg>
          </div>
          <div className="absolute top-1/2 right-0 -translate-y-1/2 w-96 h-96 rounded-full blur-3xl opacity-10 pointer-events-none" style={{ background: "radial-gradient(circle, #eab308 0%, transparent 70%)" }}></div>

          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
            <ScrollFade>
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-8 border border-wgc-gold-500/30 bg-wgc-gold-500/10">
                <div className="w-1.5 h-1.5 rounded-full bg-wgc-gold-500"></div>
                <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-wgc-gold-500/90 font-mono">Establish a Partnership</span>
              </div>
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight mb-6 text-wgc-navy-900">
                Let&apos;s <span className="text-wgc-gold-500">talk.</span>
              </h1>
              <p className="text-xl font-medium leading-relaxed max-w-2xl mx-auto text-wgc-navy-500 tracking-tight">
                See how WGC can serve your software and the churches you support with a standard of excellence.
              </p>
            </ScrollFade>
          </div>
        </section>

        <div className="py-24 lg:py-32 bg-wgc-off relative">
          <div className="absolute inset-x-0 top-0 h-1/2 bg-white pointer-events-none"></div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <ScrollFade>
              <div className="bg-white rounded-[3rem] shadow-2xl overflow-hidden lg:grid lg:grid-cols-2 ring-1 ring-wgc-navy-100/30">
                {/* Contact Form */}
                <div className="px-8 py-16 sm:px-12 lg:py-20 xl:p-20 border-b lg:border-b-0 lg:border-r border-wgc-navy-50">
                  <h2 className="text-3xl font-bold text-wgc-navy-900 mb-10 tracking-tight">Inquire</h2>
                  
                  <form className="space-y-8">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                      <div>
                        <label htmlFor="first-name" className="block text-[10px] font-bold text-wgc-navy-400 uppercase tracking-widest mb-2 ml-1 font-mono">First name</label>
                        <div className="mt-1">
                          <input type="text" name="first-name" id="first-name" className="block w-full bg-wgc-navy-50/50 border-wgc-navy-100/50 focus:ring-wgc-gold-500 focus:border-wgc-gold-500 rounded-xl p-4 border sm:text-sm transition-all font-bold text-wgc-navy-900" />
                        </div>
                      </div>
                      <div>
                        <label htmlFor="last-name" className="block text-[10px] font-bold text-wgc-navy-400 uppercase tracking-widest mb-2 ml-1 font-mono">Last name</label>
                        <div className="mt-1">
                          <input type="text" name="last-name" id="last-name" className="block w-full bg-wgc-navy-50/50 border-wgc-navy-100/50 focus:ring-wgc-gold-500 focus:border-wgc-gold-500 rounded-xl p-4 border sm:text-sm transition-all font-bold text-wgc-navy-900" />
                        </div>
                      </div>
                    </div>
                    
                    <div>
                      <label htmlFor="email" className="block text-[10px] font-bold text-wgc-navy-400 uppercase tracking-widest mb-2 ml-1 font-mono">Email</label>
                      <div className="mt-1">
                        <input type="email" name="email" id="email" className="block w-full bg-wgc-navy-50/50 border-wgc-navy-100/50 focus:ring-wgc-gold-500 focus:border-wgc-gold-500 rounded-xl p-4 border sm:text-sm transition-all font-bold text-wgc-navy-900" />
                      </div>
                    </div>
                    
                    <div>
                      <label htmlFor="company" className="block text-[10px] font-bold text-wgc-navy-400 uppercase tracking-widest mb-2 ml-1 font-mono">Organization</label>
                      <div className="mt-1">
                        <input type="text" name="company" id="company" className="block w-full bg-wgc-navy-50/50 border-wgc-navy-100/50 focus:ring-wgc-gold-500 focus:border-wgc-gold-500 rounded-xl p-4 border sm:text-sm transition-all font-bold text-wgc-navy-900" />
                      </div>
                    </div>
                    
                    <div>
                      <label htmlFor="role" className="block text-[10px] font-bold text-wgc-navy-400 uppercase tracking-widest mb-2 ml-1 font-mono">Organization Type</label>
                      <div className="mt-1">
                        <select id="role" name="role" className="block w-full bg-wgc-navy-50/50 border-wgc-navy-100/50 focus:ring-wgc-gold-500 focus:border-wgc-gold-500 rounded-xl p-4 border sm:text-sm transition-all font-bold text-wgc-navy-900 appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2020%2020%22%3E%3Cpath%20stroke%3D%22%236b7280%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%221.5%22%20d%3D%22m6%208%204%204%204-4%22%2F%3E%3C%2Fsvg%3E')] bg-[length:1.25rem_1.25rem] bg-[right_1rem_center] bg-no-repeat">
                          <option>Church</option>
                          <option>Nonprofit</option>
                          <option>Software Partner (ISV)</option>
                          <option>Financial Institution</option>
                          <option>Ministry Network</option>
                          <option>Other</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label htmlFor="message" className="block text-[10px] font-bold text-wgc-navy-400 uppercase tracking-widest mb-2 ml-1 font-mono">Platform Requirements</label>
                      <div className="mt-1">
                        <textarea id="message" name="message" rows={5} className="block w-full bg-wgc-navy-50/50 border-wgc-navy-100/50 focus:ring-wgc-gold-500 focus:border-wgc-gold-500 rounded-xl p-4 border sm:text-sm transition-all font-bold text-wgc-navy-900" placeholder="Briefly describe your current donation needs..."></textarea>
                      </div>
                    </div>

                    <div className="pt-4">
                      <button type="submit" className="w-full bg-wgc-gold-500 text-wgc-navy-900 py-5 px-8 text-sm font-bold rounded-xl hover:bg-black hover:text-wgc-navy-900 transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-xl uppercase tracking-[0.2em]">
                        Dispatch Inquiry
                      </button>
                    </div>
                  </form>
                </div>

                {/* Direct Contact */}
                <div className="bg-wgc-navy-50/30 px-8 py-16 sm:px-12 lg:py-20 xl:p-20 flex flex-col justify-center relative">
                  <div className="absolute inset-0 opacity-[0.03] pointer-events-none">
                     <svg className="h-full w-full" fill="none">
                       <pattern id="contact-side-bg" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                         <rect width="1" height="20" className="text-wgc-navy-900" fill="currentColor" />
                       </pattern>
                       <rect width="100%" height="100%" fill="url(#contact-side-bg)" />
                     </svg>
                  </div>
                  <div className="max-w-md mx-auto w-full relative z-10">
                    <h2 className="text-3xl font-bold text-wgc-navy-900 mb-4 tracking-tight">Direct Access</h2>
                    <p className="text-[17px] font-medium text-wgc-navy-400 mb-12 leading-relaxed tracking-tight opacity-90">
                      We prioritize high-visibility partnerships and maintain direct founder communication with every software partner on our platform.
                    </p>
                    
                    <div className="bg-white p-10 rounded-3xl border border-wgc-navy-100/30 mb-10 shadow-sm ring-1 ring-wgc-navy-50/50 group">
                      <div className="flex items-center gap-6 mb-8">
                        <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center text-wgc-gold-500 shadow-lg border border-wgc-gold-500/20">
                          <span className="font-bold text-xl">WGC</span>
                        </div>
                        <div>
                          <h3 className="font-bold text-xl text-wgc-navy-900 tracking-tight">Ministry Strategic Partnerships</h3>
                          <p className="text-[11px] font-bold text-wgc-gold-600 uppercase tracking-widest font-mono">Strategic Partnerships</p>
                        </div>
                      </div>
                      <div className="space-y-6">
                        <a href="mailto:support@wgcpayments.com" className="text-[14px] font-bold text-wgc-navy-900 flex items-center gap-3 transition-all tracking-[0.1em] hover:text-wgc-gold-600">
                          <Mail className="w-5 h-5 text-wgc-gold-500" /> support@wgcpayments.com
                        </a>
                      </div>
                    </div>

                    <a href="#" className="block w-full text-center px-8 py-5 border-2 border-wgc-navy-900 text-wgc-navy-900 text-xs font-bold rounded-xl hover:bg-black hover:text-wgc-navy-900 hover:border-black transition-all uppercase tracking-[0.2em] shadow-sm">
                      Schedule Strategic Review
                    </a>
                  </div>
                </div>
              </div>
            </ScrollFade>
            
            <p className="mt-12 text-center text-[10px] font-bold text-wgc-navy-400 uppercase tracking-[0.3em] pb-10 font-mono">Confidentiality guaranteed. One business day response SLA.</p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
