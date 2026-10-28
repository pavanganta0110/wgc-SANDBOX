import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import FindMyGivingForm from "@/components/marketing/FindMyGivingForm";

export const metadata: Metadata = {
  alternates: { canonical: "/my-giving" },
  title: "Donor Login — See Your Giving | WGC Payments",
  description: "Sign in to see your gifts, download giving statements and manage recurring donations to the churches and nonprofits you support through WGC.",
  // A sign-in utility page, not a landing page for search.
  robots: { index: false, follow: true },
};

const DONOR_STEPS = [
  { title: "Enter your email", body: "Use the email you gave with. We look for your giving across the organizations on WGC." },
  { title: "Open your link", body: "We email you a link for each organization you've given to — nothing is shown on this page." },
  { title: "Enter your code", body: "We send a one-time code to the same inbox. No password to remember." },
];

export default function MyGivingPage() {
  return (
    <>
      <Header />
      <main className="flex-grow">
        <section className="relative bg-wgc-off pt-32 pb-20 border-b border-wgc-navy-100/40">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-wgc-gold-500 font-mono mb-6">Donor Login</p>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-wgc-navy-900 mb-4">See your giving.</h1>
            <p className="text-lg text-wgc-navy-500 mb-10">View your gifts, download statements and manage recurring gifts to the organizations you support.</p>
            <FindMyGivingForm />
            <p className="mt-4 text-xs text-wgc-navy-400">We never show your giving on this page — it&rsquo;s only ever sent to your inbox.</p>
          </div>
        </section>

        <section className="bg-white py-16">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 grid gap-6 sm:grid-cols-3">
            {DONOR_STEPS.map((s, i) => (
              <div key={s.title} className="rounded-2xl border border-wgc-navy-100/50 p-6">
                <p className="text-xs font-mono font-bold text-wgc-gold-500 mb-2">0{i + 1}</p>
                <h2 className="text-base font-bold text-wgc-navy-900 mb-1">{s.title}</h2>
                <p className="text-sm text-wgc-navy-500">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-wgc-off py-20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-wgc-gold-500 font-mono mb-4">For churches &amp; nonprofits</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-wgc-navy-900 mb-4">Give your donors this, too.</h2>
            <p className="text-base text-wgc-navy-500 max-w-2xl mx-auto mb-8">
              Every organization on WGC gets a branded donor portal — your logo and colors, giving history, statements, and recurring-gift management — with no extra cost to your donors.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/start" className="metallic-gold rounded-2xl px-10 py-4 text-[13px] font-bold tracking-wide">Get Started</Link>
              <Link href="/demo" className="rounded-2xl border border-wgc-navy-100 bg-white px-10 py-4 text-[13px] font-bold tracking-wide text-wgc-navy-900">See a demo</Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
