import Link from "next/link";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import TimeBack from "@/components/marketing/time-back/TimeBack";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Time-Back Calculator | WGC Payments",
  description: "See how many hours your church or nonprofit gets back each year when gift reconciliation runs through WGC.",
  alternates: { canonical: "/time-back" },
};

const CALENDLY_EMBED_URL = "https://calendly.com/waypoint-gateway-collective/1-1-wgc-first-look-2?hide_gdpr_banner=1&primary_color=ca8a04";

export default function TimeBackPage() {
  return (
    <>
      <Header />
      <main className="flex-grow">
        <section className="bg-wgc-navy-950 text-white px-4 py-20 md:py-28">
          <div className="max-w-5xl mx-auto grid gap-6">
            <span className="justify-self-start text-[10px] font-black uppercase tracking-[0.4em] text-wgc-gold-500 border border-white/15 rounded-full px-4 py-2">
              Time-back calculator for churches
            </span>
            <h1 className="text-white text-4xl md:text-6xl font-extrabold tracking-tight leading-[1.05]">
              Your books are eating <em className="text-wgc-gold-500">ministry hours.</em>
            </h1>
            <p className="text-lg text-white/70 max-w-2xl">
              Matching online gifts, payouts and fees by hand quietly takes hours away from gospel impact every month. Put in your numbers and see how many come back.
            </p>
            <div className="flex flex-wrap gap-4">
              <a href="#calculator" className="bg-wgc-grad-gold text-wgc-navy-900 px-8 py-4 rounded-2xl text-[13px] font-bold">Run your numbers</a>
              <a href="#book" className="bg-white/10 border border-white/15 px-8 py-4 rounded-2xl text-[13px] font-bold">Book Live Demo</a>
            </div>
          </div>
        </section>

        <TimeBack
          betweenVideoAndCalculator={
          <section id="book" className="bg-wgc-navy-950 text-white px-4 py-20 scroll-mt-4">
            <div className="max-w-5xl mx-auto grid gap-6">
              <span className="justify-self-start text-[10px] font-black uppercase tracking-[0.4em] text-wgc-gold-500 border border-white/15 rounded-full px-4 py-2">
                Book a live demo
              </span>
              <h2 className="!text-white text-3xl md:text-4xl font-bold tracking-tight max-w-3xl">
                Want your hours back sooner? <em className="text-wgc-gold-500">Pick a time.</em>
              </h2>
              <p className="text-white/70 max-w-2xl">
                Already using another platform? You get a step-by-step switch plan and the tools to move your recurring donors on your timeline.
              </p>
              <div className="rounded-2xl overflow-hidden bg-white">
                <iframe
                  src={CALENDLY_EMBED_URL}
                  title="Book a WGC live demo"
                  loading="lazy"
                  className="w-full border-0 h-[700px]"
                />
              </div>
              <Link href="/demo" className="justify-self-start text-sm font-bold text-wgc-gold-500 hover:underline">
                Or explore the interactive demo →
              </Link>
            </div>
          </section>
          }
        />
      </main>
      <Footer />
    </>
  );
}
