import Link from "next/link";
import { pageGraph, breadcrumbs, kansasCityBusiness } from "@/lib/schema";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import CTASection from "@/components/ui/CTASection";
import ScrollFade from "@/components/ui/ScrollFade";
import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "/kansas-city/school-payment-processing" },
  title: "School Fundraising & Tuition Payment Processing in Kansas City, MO | WGC",
  description: "Secure, low-cost payment processing for private, religious, and nonprofit schools in Kansas City, MO. Accept annual fund gifts, tuition assistance donations, and capital campaign pledges with WGC's white-label infrastructure and 25¢ ACH.",
  openGraph: {
    images: [{ url: "/og/kansas-city.png", width: 1200, height: 630 }],
    title: "School Fundraising & Tuition Payment Processing in Kansas City, MO | WGC",
    description: "Secure, low-cost school fundraising and tuition-assistance payment processing in Kansas City, MO with a flat 25¢ ACH rate and capped card fees.",
    url: "https://www.wgcpayments.com/kansas-city/school-payment-processing",
  },
};

const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What's the most cost-effective school fundraising payment processor in Kansas City?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "WGC is a cost-effective payment processor for Kansas City schools and school foundations with a flat 25¢ ACH rate and capped card processing fees at 2.3% + 25¢. Avoiding standard percentage-based ACH markups helps local schools, PTAs, and booster clubs keep more of every fundraising dollar."
      }
    },
    {
      "@type": "Question",
      "name": "Can a Kansas City school run separate giving pages for its annual fund and a capital campaign?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. Each fund, campaign, class, or booster club can have its own dedicated giving link, with WGC's dashboard reporting totals broken down by campaign automatically — useful for schools running an annual fund, a capital campaign, and class-specific fundraisers at the same time."
      }
    },
    {
      "@type": "Question",
      "name": "How much does school fundraising payment processing cost?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "School fundraising payment processing with WGC costs a maximum of 2.3% + 25¢ per card transaction, 25¢ per ACH transaction, and a simple $10 monthly platform fee. There are no hidden setup fees or long-term contracts."
      }
    },
    {
      "@type": "Question",
      "name": "Can tuition assistance and scholarship giving stay separate from general school donations?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. Kansas City schools can create a dedicated giving link for tuition assistance or scholarship funds, so those gifts are tracked and reported separately from general operating or annual fund donations."
      }
    }
  ]
};

const LOCAL_SCHEMA = pageGraph(kansasCityBusiness, breadcrumbs([
  { name: "Home", path: "/" },
  { name: "Kansas City", path: "/kansas-city/school-payment-processing" },
  { name: "School Payment Processing", path: "/kansas-city/school-payment-processing" },
]));

export default function KansasCitySchoolPayments() {
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
              <pattern id="kc-grid-schools" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" strokeWidth="1" className="text-wgc-navy-300" />
              </pattern>
              <rect width="100%" height="100%" fill="url(#kc-grid-schools)" />
            </svg>
          </div>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
            <ScrollFade>
              <div className="inline-flex items-center gap-3 px-5 py-2 rounded-xl mb-10 border border-wgc-gold-500/20 bg-wgc-gold-500/5">
                <span className="text-[10px] font-black uppercase tracking-[0.4em] text-wgc-gold-500/90 font-mono">Kansas City, MO</span>
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-7xl font-bold tracking-tight mb-8 text-white">
                School Fundraising & Tuition Payment Processing in <span className="text-wgc-gold-500 italic">Kansas City, MO</span>
              </h1>
              <p className="text-lg sm:text-xl font-medium leading-relaxed mb-12 text-white/70 max-w-2xl mx-auto">
                Reliable, low-cost payment processing for Kansas City's private, religious, and nonprofit schools — annual funds, tuition assistance, capital campaigns, and class-specific fundraisers, all in one place.
              </p>
            </ScrollFade>
          </div>
        </section>

        {/* Content Section */}
        <section className="py-20 text-wgc-navy-950">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 prose prose-lg prose-headings:text-wgc-navy-950 prose-a:text-wgc-gold-600">
            <ScrollFade>
              <h2>Built for Kansas City School Communities</h2>
              <p>
                From independent and Christian schools in the KC metro to school foundations, PTA/PTO fundraising committees, and booster clubs, WGC delivers <strong>school fundraising and tuition-assistance payment processing in Kansas City, MO</strong> designed to keep more of every gift working toward your students and programs.
              </p>
              <p>
                Whether you're running an annual fund campaign, a capital project, or a class-specific booster fundraiser, our <Link href="/pricing">transparent pricing structure</Link> means no hidden transaction fees eating into what your school raises. Flat-rate ACH and capped card processing keep costs predictable year over year.
              </p>

              <h2>Separate Giving Links for Every Fund</h2>
              <p>
                Kansas City schools rarely fundraise for just one thing at a time. WGC lets your school run dedicated giving pages for the annual fund, a capital campaign, tuition assistance, and individual grade or booster fundraisers simultaneously — with each campaign's totals tracked and reported separately in one dashboard.
              </p>

              <h2>For School-Focused Software Platforms Too</h2>
              <p>
                If you're a KC-metro software provider serving schools and school foundations, WGC's white-label infrastructure lets you embed a fully branded donation experience directly into your platform. See our <Link href="/developers">developer API documentation</Link> for how our PCI Level 1 compliant gateway keeps donor data secure while your software keeps its own identity.
              </p>

              <h2>Get Started</h2>
              <p>
                See how a giving page looks in practice with our <Link href="/start">donation page demo</Link>, or if your Kansas City school or school foundation is ready to switch, <Link href="/start">register today to get started</Link>.
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
          headline="Ready to raise more for your Kansas City school?"
          subheadline="Join the schools and foundations using our infrastructure to power their fundraising."
          ctaText="Get Approved"
          ctaLink="/start"
        />
      </main>
      <Footer />
    </>
  );
}
