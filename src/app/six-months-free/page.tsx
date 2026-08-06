import type { Metadata } from "next";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import SixMonthsFreeStartButton from "@/components/marketing/SixMonthsFreeStartButton";

export const metadata: Metadata = {
  title: "Six Months Free — WGC Payments",
  description: "Get your first six months of the WGC Payments platform subscription free. $10/month afterward, automatically, until canceled.",
};

/**
 * The ONLY page that can automatically grant the Six Months Free promotion
 * — see src/lib/billing/promotionAttribution.ts. Every other signup path
 * (homepage, /start directly, First Look, audience landing pages, a
 * manually-typed promo code) gets the normal $10/month plan.
 */
export default function SixMonthsFreePage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Header />
      <main className="flex-1">
        <section className="max-w-3xl mx-auto px-6 py-20 text-center">
          <p className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-sm font-semibold mb-6">
            Limited-time offer
          </p>
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
            Six Months Free on WGC Payments
          </h1>
          <p className="text-lg text-slate-600 mb-10 max-w-2xl mx-auto">
            Start accepting donations, recurring gifts, and customer invoice payments today. Your WGC Platform
            subscription — normally $10/month — is completely free for your first six months.
          </p>

          <SixMonthsFreeStartButton />

          <p className="text-xs text-slate-400 mt-6 max-w-xl mx-auto">
            Standard card, ACH, refund, dispute, and other applicable payment-processing fees still apply during the
            promotional period. After six months, your WGC Platform subscription automatically renews at $10/month
            until canceled. Offer code {" "}
            <span className="font-mono">SIX_MONTHS_FREE_2026</span>.
          </p>
        </section>

        <section className="bg-slate-50 py-16">
          <div className="max-w-4xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            <div>
              <p className="text-3xl font-bold text-slate-900 mb-1">$0</p>
              <p className="text-sm text-slate-500">per month for your first 6 months</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-slate-900 mb-1">$10</p>
              <p className="text-sm text-slate-500">per month afterward, automatically until canceled</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-slate-900 mb-1">0</p>
              <p className="text-sm text-slate-500">setup fees to get started today</p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
