import Link from "next/link";
import { LucideIcon, CheckCircle2 } from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import FeatureCard from "@/components/ui/FeatureCard";
import CTASection from "@/components/ui/CTASection";
import ScrollFade from "@/components/ui/ScrollFade";

export interface AudienceFeature {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Optional "Coming Soon" pill for a roadmap capability that isn't live
   * yet — never set for something already shipped. */
  badge?: string;
}

export interface AudienceUseCase {
  title: string;
  description: string;
}

export interface AudienceCategory {
  title: string;
  items: string[];
}

export interface AudienceFAQ {
  question: string;
  answer: string;
}

export interface AudienceTeamRole {
  role: string;
  description: string;
}

export interface AudienceLandingContent {
  eyebrow: string;
  headline: string;
  headlineAccent: string;
  intro: string;
  whoWeServeTitle: string;
  whoWeServe: string[];
  /** Optional grouped alternative to the flat `whoWeServe` list — when
   * present, rendered as titled category cards (each with its own bullet
   * list) instead of the single flat grid. Lets a broader audience page
   * (e.g. Nonprofits, which covers several distinct sub-audiences like
   * Missions) give each sub-audience its own clearly labeled section
   * without every other audience page needing to adopt the same shape. */
  whoWeServeCategories?: AudienceCategory[];
  useCasesTitle: string;
  useCasesSubtitle: string;
  useCases: AudienceUseCase[];
  featuresTitle: string;
  featuresSubtitle: string;
  features: AudienceFeature[];
  /** Optional "Owner / Admin / Fundraiser / Viewer" team-accounts spotlight,
   * rendered between Features and FAQ. Omit to skip the section entirely —
   * lets pages that don't want it (or haven't been updated yet) render
   * unchanged. */
  teamSpotlightTitle?: string;
  teamSpotlightSubtitle?: string;
  teamRoles?: AudienceTeamRole[];
  faqTitle: string;
  faqs: AudienceFAQ[];
  ctaHeadline: string;
  ctaSubheadline: string;
  ctaText?: string;
}

export default function AudienceLandingPage({ content }: { content: AudienceLandingContent }) {
  const {
    eyebrow,
    headline,
    headlineAccent,
    intro,
    whoWeServeTitle,
    whoWeServe,
    whoWeServeCategories,
    useCasesTitle,
    useCasesSubtitle,
    useCases,
    featuresTitle,
    featuresSubtitle,
    features,
    teamSpotlightTitle,
    teamSpotlightSubtitle,
    teamRoles,
    faqTitle,
    faqs,
    ctaHeadline,
    ctaSubheadline,
    ctaText,
  } = content;

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <Header />
      <main className="flex-grow">
        {/* HERO SECTION */}
        <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 overflow-hidden bg-wgc-navy-950">
          <div className="absolute inset-0 z-0">
            <div className="absolute inset-0 bg-wgc-navy-950/90 mix-blend-multiply z-10"></div>
            <svg className="absolute left-0 top-0 h-full w-full opacity-[0.03]" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="grid-pattern-hero" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M0 40V0h40" fill="none" stroke="currentColor" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid-pattern-hero)" />
            </svg>
            <div className="absolute -top-48 -right-48 w-96 h-96 bg-wgc-gold-500/20 blur-[100px] rounded-full"></div>
            <div className="absolute top-1/2 left-1/4 w-64 h-64 bg-[#eab308]/10 blur-[80px] rounded-full"></div>
          </div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-20">
            <div className="text-center max-w-4xl mx-auto">
              <ScrollFade>
                <p className="text-wgc-gold-500 text-xs font-bold tracking-[0.25em] uppercase mb-6">{eyebrow}</p>
                <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-white mb-8 leading-[1.1]">
                  {headline} <span className="text-wgc-gold-500 italic font-playfair pr-2">{headlineAccent}</span>
                </h1>
                <p className="text-lg md:text-xl text-white/80 max-w-2xl mx-auto mb-10 leading-relaxed">
                  {intro}
                </p>
                <div className="flex flex-col sm:flex-row justify-center gap-4">
                  <Link href="/start" className="metallic-gold inline-flex items-center justify-center px-10 py-5 text-[13px] font-bold rounded-2xl transition-all shadow-2xl hover:-translate-y-1 tracking-wide">
                    Get Started
                  </Link>
                  <Link href="/demo" className="inline-flex items-center justify-center px-10 py-5 text-[13px] font-bold rounded-2xl transition-all border border-white/20 text-white hover:bg-white/10 tracking-wide">
                    See a Live Demo
                  </Link>
                </div>
              </ScrollFade>
            </div>
          </div>
        </section>

        {/* WHO WE SERVE SECTION */}
        <section className="py-20 bg-white border-b border-wgc-navy-50">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <ScrollFade>
              <h2 className="text-2xl md:text-3xl font-bold text-wgc-navy-900 mb-10 text-center">
                {whoWeServeTitle}
              </h2>
              {whoWeServeCategories ? (
                <div className="grid sm:grid-cols-2 gap-6">
                  {whoWeServeCategories.map((category) => (
                    <div key={category.title} className="p-6 rounded-2xl bg-wgc-off border border-wgc-navy-50">
                      <h3 className="text-sm font-bold text-wgc-navy-900 uppercase tracking-wide mb-4">{category.title}</h3>
                      <div className="space-y-2.5">
                        {category.items.map((item) => (
                          <div key={item} className="flex items-start gap-2.5">
                            <CheckCircle2 className="w-4 h-4 text-wgc-gold-500 shrink-0 mt-0.5" />
                            <span className="text-wgc-navy-700 text-sm font-medium">{item}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-4">
                  {whoWeServe.map((item) => (
                    <div key={item} className="flex items-start gap-3 p-4 rounded-xl bg-wgc-off border border-wgc-navy-50">
                      <CheckCircle2 className="w-5 h-5 text-wgc-gold-500 shrink-0 mt-0.5" />
                      <span className="text-wgc-navy-700 text-sm font-medium">{item}</span>
                    </div>
                  ))}
                </div>
              )}
            </ScrollFade>
          </div>
        </section>

        {/* USE CASES SECTION */}
        <section className="py-24 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-wgc-navy-900 mb-4">{useCasesTitle}</h2>
              <p className="text-wgc-navy-400">{useCasesSubtitle}</p>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              {useCases.map((useCase, idx) => (
                <ScrollFade key={useCase.title} delay={idx * 0.1}>
                  <div className="p-8 h-full rounded-3xl border border-wgc-navy-50 bg-wgc-off">
                    <h3 className="text-lg font-bold text-wgc-navy-900 mb-3">{useCase.title}</h3>
                    <p className="text-wgc-navy-500 text-sm leading-relaxed">{useCase.description}</p>
                  </div>
                </ScrollFade>
              ))}
            </div>
          </div>
        </section>

        {/* FEATURES SECTION */}
        <section className="py-24 bg-wgc-off relative">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-wgc-navy-900 mb-4">{featuresTitle}</h2>
              <p className="text-wgc-navy-400">{featuresSubtitle}</p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map((feature, idx) => (
                <ScrollFade key={feature.title} delay={idx * 0.1}>
                  <FeatureCard icon={feature.icon} title={feature.title} description={feature.description} badge={feature.badge} />
                </ScrollFade>
              ))}
            </div>
          </div>
        </section>

        {/* TEAM & PERMISSIONS SPOTLIGHT */}
        {teamRoles && teamRoles.length > 0 && (
          <section className="py-24 bg-white border-t border-wgc-navy-50">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
              <ScrollFade>
                <div className="grid lg:grid-cols-2 gap-16 items-center">
                  <div>
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-wgc-navy-50 text-wgc-navy-600 text-[10px] font-bold tracking-[0.2em] uppercase mb-6 border border-wgc-navy-100 font-mono">
                      Built for Real Teams
                    </div>
                    <h2 className="text-3xl md:text-5xl font-bold text-wgc-navy-950 mb-6 tracking-tight">
                      {teamSpotlightTitle || "Stop sharing one login"}
                    </h2>
                    <p className="text-lg text-wgc-navy-500 leading-relaxed">
                      {teamSpotlightSubtitle ||
                        "Give every staff member and volunteer their own account, scoped to exactly what they need — instead of one shared password everyone knows."}
                    </p>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-5">
                    {teamRoles.map((r) => (
                      <div key={r.role} className="bg-wgc-off rounded-2xl border border-wgc-navy-100 p-6">
                        <div className="text-[10px] font-black text-wgc-gold-600 uppercase tracking-widest mb-2 font-mono">{r.role}</div>
                        <p className="text-sm font-medium text-wgc-navy-600 leading-relaxed">{r.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </ScrollFade>
            </div>
          </section>
        )}

        {/* FAQ SECTION */}
        <section className="py-24 bg-white border-t border-wgc-navy-50">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <ScrollFade>
              <h2 className="text-3xl md:text-4xl font-bold text-wgc-navy-900 mb-12 text-center">{faqTitle}</h2>
              <div className="space-y-6">
                {faqs.map((faq) => (
                  <div key={faq.question} className="border-b border-wgc-navy-50 pb-6">
                    <h3 className="text-base font-bold text-wgc-navy-900 mb-2">{faq.question}</h3>
                    <p className="text-wgc-navy-500 text-sm leading-relaxed">{faq.answer}</p>
                  </div>
                ))}
              </div>
            </ScrollFade>
          </div>
        </section>

        {/* CTA SECTION */}
        <CTASection headline={ctaHeadline} subheadline={ctaSubheadline} ctaText={ctaText || "Get Started"} ctaLink="/start" />
      </main>
      <Footer />
    </>
  );
}
