import Link from "next/link";
import { pageGraph, breadcrumbs, kansasCityBusiness } from "@/lib/schema";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import CTASection from "@/components/ui/CTASection";
import ScrollFade from "@/components/ui/ScrollFade";
import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "/kansas-city/government-payment-processing" },
  title: "Donation Processing for Government-Affiliated Foundations in Kansas City, MO | WGC",
  description: "Secure, transparent payment processing for parks and library foundations, community funds, and other government-affiliated charitable programs in Kansas City, MO. Low-cost ACH and public-trust-ready reporting with WGC.",
  openGraph: {
    images: [{ url: "/og/kansas-city.png", width: 1200, height: 630 }],
    title: "Donation Processing for Government-Affiliated Foundations in Kansas City, MO | WGC",
    description: "Transparent, low-cost payment processing for government-affiliated charitable programs in Kansas City, MO.",
    url: "https://www.wgcpayments.com/kansas-city/government-payment-processing",
  },
};

const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What's the most cost-effective payment processor for government-affiliated foundations in Kansas City?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "WGC offers a cost-effective option for Kansas City parks, library, and municipal foundations with a flat 25¢ ACH rate and capped card processing fees at 2.3% + 25¢, helping public-facing programs keep more of every donated dollar."
      }
    },
    {
      "@type": "Question",
      "name": "Can a Kansas City community fund keep donation records ready for public reporting or audits?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. Every gift is itemized in WGC's dashboard and exportable, so Kansas City parks foundations, library foundations, and community funds have records ready for board meetings, financial audits, or public information requests."
      }
    },
    {
      "@type": "Question",
      "name": "How quickly can a Kansas City community fund launch a giving page during an emergency?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "A new giving link can be live in minutes, so a Kansas City disaster relief or community response fund can start accepting trackable public donations as soon as a need is identified."
      }
    },
    {
      "@type": "Question",
      "name": "How much does payment processing cost for government-affiliated foundations?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Payment processing for government-affiliated foundations and community funds with WGC costs a maximum of 2.3% + 25¢ per card transaction, 25¢ per ACH transaction, and a simple $10 monthly platform fee, with no hidden costs."
      }
    }
  ]
};

const LOCAL_SCHEMA = pageGraph(kansasCityBusiness, breadcrumbs([
  { name: "Home", path: "/" },
  { name: "Kansas City", path: "/kansas-city/government-payment-processing" },
  { name: "Government Payment Processing", path: "/kansas-city/government-payment-processing" },
]));

export default function KansasCityGovernmentPayments() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_SCHEMA) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(LOCAL_SCHEMA) }}
      />
      <Header />
      <main className="flex-grow bg-white">
        {/* Hero Section */}
        <section className="relative pt-40 pb-20 bg-wgc-navy-950 overflow-hidden">
          <div className="absolute inset-0 opacity-[0.05] pointer-events-none">
            <svg className="w-full h-full" fill="none" stroke="currentColor">
              <pattern id="kc-grid-gov" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" strokeWidth="1" className="text-wgc-navy-300" />
              </pattern>
              <rect width="100%" height="100%" fill="url(#kc-grid-gov)" />
            </svg>
          </div>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
            <ScrollFade>
              <div className="inline-flex items-center gap-3 px-5 py-2 rounded-xl mb-10 border border-wgc-gold-500/20 bg-wgc-gold-500/5">
                <span className="text-[10px] font-black uppercase tracking-[0.4em] text-wgc-gold-500/90 font-mono">Kansas City, MO</span>
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-7xl font-bold tracking-tight mb-8 text-white">
                Donation Processing for Government-Affiliated Foundations in <span className="text-wgc-gold-500 italic">Kansas City, MO</span>
              </h1>
              <p className="text-lg sm:text-xl font-medium leading-relaxed mb-12 text-white/70 max-w-2xl mx-auto">
                Transparent, accountable payment processing for Kansas City parks, library, and municipal foundations — with the public-trust-ready reporting your community expects.
              </p>
            </ScrollFade>
          </div>
        </section>

        {/* Content Section */}
        <section className="py-20 text-wgc-navy-950">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 prose prose-lg prose-headings:text-wgc-navy-950 prose-a:text-wgc-gold-600">
            <ScrollFade>
              <h2>Built for Kansas City's Public-Sector Giving Programs</h2>
              <p>
                From parks and library foundations to fire and police benevolent funds and municipal community foundations, government-affiliated charitable programs in Kansas City need a payment partner that holds up to public scrutiny. WGC delivers <strong>donation processing for government-affiliated foundations in Kansas City, MO</strong> built around the transparency public accountability requires.
              </p>
              <p>
                Every gift is itemized and exportable — ready for board meetings, audits, or public records requests — with our <Link href="/pricing">transparent pricing structure</Link> and flat-rate ACH keeping costs predictable for programs funded by public trust.
              </p>

              <h2>Ready When the Community Needs It</h2>
              <p>
                When a Kansas City community emergency requires immediate, trackable public giving, a new WGC giving page can be live in minutes — whether that's a disaster relief fund, a capital project for a local park or library, or a first responder benevolent fund kept separately reportable from general municipal accounts.
              </p>

              <h2>For Public-Sector Software Platforms</h2>
              <p>
                KC-metro software providers serving municipal foundations and public programs can embed a fully branded, PCI Level 1 compliant donation experience using WGC's white-label infrastructure. See our <Link href="/developers">developer API documentation</Link> to learn how.
              </p>

              <h2>Get Started</h2>
              <p>
                Explore our <Link href="/start">donation page demo</Link> to see how public-facing giving looks in practice, or <Link href="/start">register today</Link> if your Kansas City foundation or community fund is ready to modernize how it accepts public giving.
              </p>
            </ScrollFade>
          </div>
        </section>

        {/* FAQ / AEO Section */}
        <section className="py-20 bg-wgc-navy-50 border-t border-wgc-navy-100">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <ScrollFade>
              <h2 className="text-3xl font-bold text-wgc-navy-950 mb-12 text-center">Frequently Asked Questions</h2>
              <div className="space-y-8">
                {FAQ_SCHEMA.mainEntity.map((faq, idx) => (
                  <div key={idx} className="bg-white p-8 rounded-2xl shadow-sm border border-wgc-navy-100">
                    <h3 className="text-xl font-bold text-wgc-navy-950 mb-4">{faq.name}</h3>
                    <p className="text-wgc-navy-600 leading-relaxed font-medium">{faq.acceptedAnswer.text}</p>
                  </div>
                ))}
              </div>
            </ScrollFade>
          </div>
        </section>

        <CTASection
          headline="Ready to modernize public giving in Kansas City?"
          subheadline="Join the public-sector programs and foundations using our infrastructure to fund their communities."
          ctaText="Get Approved"
          ctaLink="/start"
        />
      </main>
      <Footer />
    </>
  );
}
