import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import CTASection from "@/components/ui/CTASection";
import ScrollFade from "@/components/ui/ScrollFade";
import { pageGraph, breadcrumbs } from "@/lib/schema";
import { COMPETITORS, COMPETITOR_SLUGS, getCompetitor } from "./competitors";
import type { Metadata } from "next";

// WGC's own rates, kept in sync with /compare/page.tsx and /pricing by
// hand (both are hand-maintained marketing copy, same as every other
// pricing mention across the marketing site — there's no single source
// of truth to import from without pulling marketing content into a
// shared data module, which isn't worth doing for three strings).
const WGC = {
  card: "2.3% + $0.25 (capped)",
  ach: "25¢ flat",
  platformFee: "$10/mo",
};

export function generateStaticParams() {
  return COMPETITOR_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const competitor = getCompetitor(slug);
  if (!competitor) return {};

  const title = `WGC vs. ${competitor.name} | Church & Nonprofit Giving Platform Comparison`;
  const description = `Compare WGC's card rate, ACH rate, and monthly platform fee against ${competitor.name} — ${competitor.tagline}`;

  return {
    alternates: { canonical: `/compare/${competitor.slug}` },
    title,
    description,
    openGraph: {
      images: [{ url: "/og/default.png", width: 1200, height: 630 }],
      title,
      description,
      url: `https://www.wgcpayments.com/compare/${competitor.slug}`,
    },
  };
}

export default async function CompetitorComparePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const competitor = getCompetitor(slug);
  if (!competitor) notFound();

  const jsonLd = pageGraph(
    breadcrumbs([
      { name: "Home", path: "/" },
      { name: "Compare", path: "/compare" },
      { name: `WGC vs. ${competitor.name}`, path: `/compare/${competitor.slug}` },
    ]),
    {
      "@type": "FAQPage",
      mainEntity: competitor.faqs.map((f) => ({
        "@type": "Question",
        name: f.question,
        acceptedAnswer: { "@type": "Answer", text: f.answer },
      })),
    }
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Header />
      <main className="flex-grow">
        {/* HERO */}
        <section className="relative pt-32 pb-20 md:pt-48 md:pb-24 overflow-hidden bg-wgc-navy-950">
          <div className="absolute inset-0 opacity-[0.05] pointer-events-none">
            <svg className="w-full h-full" fill="none" stroke="currentColor">
              <pattern id="compete-grid" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" strokeWidth="1" className="text-wgc-navy-300" />
              </pattern>
              <rect width="100%" height="100%" fill="url(#compete-grid)" />
            </svg>
          </div>
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
            <ScrollFade>
              <div className="inline-flex items-center gap-3 px-5 py-2 rounded-xl mb-8 border border-wgc-gold-500/20 bg-wgc-gold-500/5">
                <span className="text-[10px] font-black uppercase tracking-[0.4em] text-wgc-gold-500/90 font-mono">
                  WGC vs. {competitor.shortName}
                </span>
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] mb-6 !text-white">
                WGC vs. {competitor.name}
              </h1>
              <p className="text-lg sm:text-xl font-medium leading-relaxed text-white/70 max-w-2xl mx-auto tracking-tight mb-10">
                {competitor.tagline}
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-4">
                <Link href="/pricing#calculator" className="bg-wgc-gold-500 text-wgc-navy-950 inline-flex items-center justify-center px-8 py-4 text-[13px] font-bold rounded-2xl shadow-xl transform transition-all hover:scale-105 hover:bg-white uppercase tracking-widest">
                  Calculate Your Savings
                </Link>
                <Link href="/switch" className="bg-white/10 text-white inline-flex items-center justify-center px-8 py-4 text-[13px] font-bold rounded-2xl border border-white/20 transition-all hover:bg-white hover:text-wgc-navy-950 uppercase tracking-widest">
                  Migrate From {competitor.shortName}
                </Link>
              </div>
            </ScrollFade>
          </div>
        </section>

        {/* QUICK TABLE */}
        <section className="py-20 bg-white border-b border-wgc-navy-100">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <ScrollFade>
              <div className="overflow-x-auto rounded-3xl border border-wgc-navy-100 shadow-sm">
                <table className="w-full min-w-[520px] text-left border-collapse">
                  <thead>
                    <tr className="bg-wgc-navy-950">
                      <th className="px-6 py-5 text-[11px] font-black uppercase tracking-[0.2em] text-white/60 font-mono">Platform</th>
                      <th className="px-6 py-5 text-[11px] font-black uppercase tracking-[0.2em] text-white/60 font-mono">Card rate</th>
                      <th className="px-6 py-5 text-[11px] font-black uppercase tracking-[0.2em] text-white/60 font-mono">ACH rate</th>
                      <th className="px-6 py-5 text-[11px] font-black uppercase tracking-[0.2em] text-white/60 font-mono">Platform fee</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-wgc-gold-500/10 border-b border-wgc-gold-500/20">
                      <td className="px-6 py-6 align-top">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-wgc-gold-600 shrink-0" />
                          <span className="font-black text-wgc-navy-950">WGC</span>
                        </div>
                      </td>
                      <td className="px-6 py-6 align-top text-[14px] font-semibold text-wgc-navy-800">{WGC.card}</td>
                      <td className="px-6 py-6 align-top text-[14px] font-semibold text-wgc-navy-800">{WGC.ach}</td>
                      <td className="px-6 py-6 align-top text-[14px] font-semibold text-wgc-navy-800">{WGC.platformFee}</td>
                    </tr>
                    <tr className="bg-white">
                      <td className="px-6 py-6 align-top font-bold text-wgc-navy-900">{competitor.name}</td>
                      <td className="px-6 py-6 align-top text-[14px] font-semibold text-wgc-navy-800">{competitor.card}</td>
                      <td className="px-6 py-6 align-top text-[14px] font-semibold text-wgc-navy-800">{competitor.ach}</td>
                      <td className="px-6 py-6 align-top text-[14px] font-semibold text-wgc-navy-800">{competitor.platformFee}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </ScrollFade>
            <ScrollFade>
              <p className="mt-6 text-[12px] font-medium text-wgc-navy-400 leading-relaxed max-w-2xl">
                Rates shown are {competitor.name}&apos;s own published starting rates, or figures from recent independent teardowns, as of September 2026 — confirm current numbers directly before switching. See the{" "}
                <Link href="/compare" className="text-wgc-gold-600 font-bold hover:underline">full 9-platform comparison</Link> or WGC&apos;s own rates on the{" "}
                <Link href="/pricing" className="text-wgc-gold-600 font-bold hover:underline">pricing page</Link>.
              </p>
            </ScrollFade>
          </div>
        </section>

        {/* OVERVIEW */}
        <section className="py-20 bg-wgc-off">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <ScrollFade>
              <p className="text-lg text-wgc-navy-600 leading-relaxed font-medium">{competitor.overview}</p>
            </ScrollFade>
          </div>
        </section>

        {/* DIFFERENTIATORS */}
        <section className="py-24 bg-white">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <ScrollFade>
              <div className="text-center max-w-2xl mx-auto mb-16">
                <h2 className="text-3xl md:text-4xl font-bold text-wgc-navy-950 tracking-tight mb-4">
                  Where WGC and {competitor.shortName} actually differ
                </h2>
              </div>
            </ScrollFade>
            <div className="space-y-6">
              {competitor.differentiators.map((d, i) => (
                <ScrollFade key={d.title} delay={i * 100}>
                  <div className="flex items-start gap-6 p-8 rounded-3xl border border-wgc-navy-100 bg-wgc-off">
                    <div className="w-10 h-10 rounded-2xl bg-white border border-wgc-navy-100 flex items-center justify-center shrink-0 shadow-sm">
                      <CheckCircle2 className="w-5 h-5 text-wgc-gold-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-wgc-navy-900 mb-2">{d.title}</h3>
                      <p className="text-[15px] font-medium text-wgc-navy-500 leading-relaxed">{d.body}</p>
                    </div>
                  </div>
                </ScrollFade>
              ))}
            </div>
          </div>
        </section>

        {/* WHEN THEY MAKE SENSE */}
        <section className="py-20 bg-wgc-navy-950">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <ScrollFade>
              <div className="inline-flex items-center gap-3 px-5 py-2 rounded-xl mb-8 border border-wgc-gold-500/20 bg-wgc-gold-500/5">
                <span className="text-[10px] font-black uppercase tracking-[0.4em] text-wgc-gold-500/90 font-mono">In Fairness</span>
              </div>
              <h2 className="text-2xl md:text-3xl font-bold !text-white tracking-tight mb-6">
                When {competitor.shortName} might still be the right call
              </h2>
              <p className="text-white/70 leading-relaxed text-lg">{competitor.whenTheyMakeSense}</p>
            </ScrollFade>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-24 bg-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <ScrollFade>
              <div className="text-center mb-16">
                <h2 className="text-3xl font-bold text-wgc-navy-950 tracking-tight mb-4">
                  WGC vs. {competitor.shortName}, answered
                </h2>
              </div>
              <div className="space-y-8">
                {competitor.faqs.map((faq) => (
                  <div key={faq.question} className="bg-wgc-off p-8 rounded-3xl border border-wgc-navy-100">
                    <h3 className="text-xl font-bold text-wgc-navy-950 mb-3">{faq.question}</h3>
                    <p className="text-wgc-navy-500 leading-relaxed font-medium">{faq.answer}</p>
                  </div>
                ))}
              </div>
            </ScrollFade>
          </div>
        </section>

        {/* OTHER COMPARISONS */}
        <section className="py-16 bg-wgc-off border-y border-wgc-navy-100">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <ScrollFade>
              <p className="text-center text-[11px] font-black text-wgc-navy-400 uppercase tracking-[0.3em] mb-6 font-mono">
                Comparing a different platform?
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                {COMPETITORS.filter((c) => c.slug !== competitor.slug).map((c) => (
                  <Link
                    key={c.slug}
                    href={`/compare/${c.slug}`}
                    className="px-5 py-2.5 rounded-xl bg-white border border-wgc-navy-100 text-[12px] font-bold text-wgc-navy-700 hover:border-wgc-gold-500/40 hover:text-wgc-navy-950 transition-all"
                  >
                    vs. {c.shortName}
                  </Link>
                ))}
              </div>
            </ScrollFade>
          </div>
        </section>

        <CTASection
          headline={`Ready to see what switching from ${competitor.shortName} actually saves?`}
          subheadline="Run your current giving numbers through our calculator, or talk to us directly about migrating."
          ctaText="Talk to Sales"
          ctaLink="/contact"
        />
      </main>
      <Footer />
    </>
  );
}
