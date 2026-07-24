import Image from "next/image";
import Link from "next/link";
import FirstLookForm from "@/components/marketing/FirstLookForm";

export const metadata = {
  title: "First Look | WGC Payments",
  description: "Join the live working session for the giving platform built for churches.",
};

function DecorativeBar() {
  return (
    <div className="w-full h-[14px] flex">
      {/* Repeating pattern of brass and stone */}
      <div className="w-1/2 h-full bg-[#E8E0CF]"></div>
      <div className="w-1/2 h-full bg-[#C9992E]"></div>
    </div>
  );
}

function Header() {
  return (
    <header className="w-full bg-[#FFFDF8] border-b border-[rgba(20,33,61,0.13)] px-6 py-4 flex justify-between items-center">
      <div className="flex flex-col">
        <Image src="/wgc-brand-final.png" alt="Waypoint Gateway Collective" width={120} height={32} className="h-8 w-auto" />
      </div>
      <a 
        href="#join"
        className="text-xs font-bold uppercase tracking-wider text-[#14213D] border border-[#14213D] rounded-full px-5 py-2 hover:bg-[#14213D] hover:text-[#FFFDF8] transition-colors"
      >
        Join First Look
      </a>
    </header>
  );
}

function Footer() {
  return (
    <footer className="w-full bg-[#14213D] text-[#FFFDF8] py-16 px-6 text-center border-t-4 border-[#C9992E]">
      <div className="max-w-4xl mx-auto flex flex-col items-center">
        <span className="font-serif text-2xl font-bold mb-2">Waypoint Gateway Collective</span>
        <a href="https://wgcpayments.com" className="text-[#C9992E] hover:underline mb-8 font-mono text-sm">wgcpayments.com</a>
        
        <p className="font-serif italic text-[#E8E0CF] text-lg">“Thus far the Lord has helped us.” — 1 Samuel 7:12</p>
      </div>
    </footer>
  );
}

export default function FirstLookPage() {
  return (
    <div className="min-h-screen bg-[#F5F1E8] text-[#14213D] font-sans">
      <DecorativeBar />
      <Header />

      <main>
        {/* HERO SECTION */}
        <section className="px-6 pt-20 pb-16 md:pt-32 md:pb-24 max-w-[1120px] mx-auto text-center">
          <span className="inline-block text-[11px] uppercase font-mono font-bold text-[#8C5A33] mb-6 tracking-widest border-b-2 border-[#C9992E] pb-1">
            First Look — Live Working Session
          </span>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-serif font-medium leading-[1.1] mb-8 text-[#14213D] max-w-4xl mx-auto">
            Your giving platform was built for retail and <span className="text-[#8C5A33] border-b-4 border-[#C9992E]">retrofitted</span> for church.
          </h1>
          <p className="text-lg md:text-xl text-[#41506F] max-w-2xl mx-auto mb-10 leading-relaxed">
            Ours wasn't. We're building payments and giving infrastructure for churches and ministries from the first line of code — and we want church leaders in the room while we do it.
          </p>
          <div className="flex flex-col items-center gap-4">
            <a 
              href="#join"
              className="inline-block bg-[#14213D] hover:bg-[#203154] text-white font-bold py-4 px-10 rounded-[3px] text-lg transition-colors shadow-sm"
            >
              Save my seat
            </a>
            <span className="text-sm font-mono text-[#41506F]">Free. About 20 minutes. Bring your wish list.</span>
          </div>
        </section>

        {/* PRODUCT SCREENSHOT */}
        <section className="px-6 pb-24 max-w-[1120px] mx-auto">
          <div className="bg-[#FFFDF8] rounded-[6px] border border-[rgba(20,33,61,0.13)] shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-2 md:p-4">
            <div className="w-full aspect-[16/9] bg-[#E8E0CF] rounded overflow-hidden relative flex items-center justify-center">
              {/* Dashboard Preview Image */}
              <Image 
                src="/images/first-look-dashboard.png" 
                alt="Admin View — Transaction Insights"
                fill
                className="object-cover object-top"
                sizes="(max-width: 1120px) 100vw, 1120px"
              />
            </div>
          </div>
          <p className="text-center text-xs font-mono uppercase tracking-widest text-[#41506F] mt-4">Admin View — Transaction Insights, Live</p>
        </section>

        {/* FEATURE SECTION */}
        <section className="bg-[#E8E0CF] border-y border-[rgba(20,33,61,0.13)] py-24 px-6">
          <div className="max-w-[1120px] mx-auto">
            <div className="mb-16 text-center max-w-3xl mx-auto">
              <span className="inline-block text-[11px] uppercase font-mono font-bold text-[#8C5A33] mb-4 tracking-widest border-b-2 border-[#C9992E] pb-1">
                What that actually means
              </span>
              <h2 className="text-3xl md:text-5xl font-serif text-[#14213D] mb-6">Built for how a church actually handles money.</h2>
              <p className="text-[#41506F] text-lg leading-relaxed">
                Not a retail checkout with the word “donation” swapped in. Every screen assumes funds, designations, recurring givers, and a treasurer who has to reconcile it all on Monday.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-0.5 bg-[rgba(20,33,61,0.08)] border border-[rgba(20,33,61,0.08)]">
              {[
                { title: "Givers cover the fee", body: "One checkbox at checkout and the full gift lands in the fund. Most givers say yes when you simply ask." },
                { title: "Recurring that holds", body: "Set to the 1st and 15th by default, because that's when people get paid. Card updates handled quietly in the background." },
                { title: "Designated funds", body: "Building fund, missions, benevolence. Split at the point of the gift so it doesn't get sorted by hand later." },
                { title: "Giving links anywhere", body: "Bulletin, text, kiosk, QR on the screen. Same page, same reporting, no separate system to babysit." },
                { title: "Reporting a treasurer can read", body: "Deposits, settlements, and disputes in plain language, tied back to the gift that caused them." },
                { title: "Enterprise-grade rails", body: "We didn't build our own payment infrastructure. We built on the same rails powering some of the largest platforms in fintech." }
              ].map((feature, i) => (
                <div key={i} className="bg-[#FFFDF8] p-8 md:p-10">
                  <h3 className="font-serif text-2xl text-[#14213D] mb-3">{feature.title}</h3>
                  <p className="text-[#41506F] leading-relaxed text-sm md:text-base">{feature.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* GIVER FLOW SECTION */}
        <DecorativeBar />
        <section className="py-24 px-6 overflow-hidden">
          <div className="max-w-[1120px] mx-auto grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
            <div>
              <span className="inline-block text-[11px] uppercase font-mono font-bold text-[#8C5A33] mb-4 tracking-widest border-b-2 border-[#C9992E] pb-1">
                The Giver's Side
              </span>
              <h2 className="text-3xl md:text-5xl font-serif text-[#14213D] mb-6 leading-tight">Three taps, on a phone, in a pew.</h2>
              <p className="text-[#41506F] text-lg leading-relaxed mb-8">
                The giving page is the only part of your system most of your congregation will ever see. It should look like it belongs to your church, load fast, and not ask for anything it doesn't need.
              </p>
              
              <div className="border-l-2 border-[#C9992E] pl-6 py-2 mb-8">
                <p className="font-serif text-xl md:text-2xl text-[#14213D] italic leading-relaxed">
                  “I'll cover the $0.75 processing fee so my full $25.00 gift goes to First Community Church.”
                </p>
              </div>
              
              <p className="text-[#41506F] leading-relaxed">
                That one line changes your effective rate more than any negotiation will. It's on by default.
              </p>
            </div>
            
            <div className="relative mx-auto w-full max-w-[320px]">
              {/* Phone Frame Mock */}
              <div className="aspect-[9/19] bg-[#14213D] rounded-[40px] p-3 shadow-2xl relative border-4 border-[#203154]">
                <div className="w-full h-full bg-[#F5F1E8] rounded-[30px] overflow-hidden relative">
                   <Image 
                     src="/images/first-look-phone.png"
                     alt="Giving App Preview"
                     fill
                     className="object-cover"
                     sizes="320px"
                   />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FOUNDER SECTION */}
        <section className="bg-[#14213D] text-[#FFFDF8] py-24 px-6 border-y-4 border-[#C9992E]">
          <div className="max-w-[1120px] mx-auto grid grid-cols-1 md:grid-cols-12 gap-12 items-center">
            <div className="md:col-span-4 flex flex-col items-center md:items-start">
              <span className="inline-block text-[11px] uppercase font-mono font-bold text-[#E3B94F] mb-6 tracking-widest border-b-2 border-[#C9992E] pb-1">
                Who's building it
              </span>
              <div className="w-[170px] h-[170px] rounded-full border-4 border-[#C9992E] overflow-hidden bg-[#203154] mb-6 relative">
                 <Image 
                   src="/images/collin.png"
                   alt="Collin Sansom"
                   fill
                   className="object-cover"
                   sizes="170px"
                 />
              </div>
              <p className="font-serif italic text-xl leading-relaxed text-[#E8E0CF] text-center md:text-left">
                “I spent years watching ministries lose money to processors that didn't understand them. So I'm building one that does.”
              </p>
            </div>
            
            <div className="md:col-span-8 md:pl-12 md:border-l border-[rgba(255,255,255,0.1)]">
              <p className="text-lg leading-relaxed text-[#E8E0CF] mb-8 font-light">
                I've spent my career in nonprofit development — managing major donor portfolios, sitting in budget meetings, and watching good organizations quietly hand over money that was given for ministry. I'm finishing a Master of Theological Studies at Midwestern Baptist Theological Seminary. I know this world from the inside, and I'd rather build this with church leaders than guess at what you need.
              </p>
              <div className="flex flex-col">
                <span className="font-serif text-2xl text-white mb-1">Collin Sansom</span>
                <span className="font-mono text-xs uppercase tracking-widest text-[#E3B94F]">Founder, Waypoint Gateway Collective</span>
              </div>
            </div>
          </div>
        </section>

        {/* REGISTRATION FORM SECTION */}
        <section className="py-24 px-6 relative">
          <FirstLookForm />
        </section>

        {/* FAQ SECTION */}
        <section className="bg-[#FFFDF8] border-t border-[rgba(20,33,61,0.13)] py-24 px-6">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-16">
              <span className="inline-block text-[11px] uppercase font-mono font-bold text-[#8C5A33] mb-4 tracking-widest border-b-2 border-[#C9992E] pb-1">
                Before you ask
              </span>
              <h2 className="text-3xl md:text-5xl font-serif text-[#14213D]">Reasonable questions.</h2>
            </div>

            <div className="space-y-4">
              {[
                {
                  q: "Is this a sales pitch?",
                  a: "No. It's a walkthrough of what we've built with time set aside for you to tell us what's missing. If you want to talk pricing or onboarding afterward, we'll set up a separate call."
                },
                {
                  q: "How long is it?",
                  a: "About twenty minutes. Roughly ten minutes of walkthrough and ten minutes of open discussion."
                },
                {
                  q: "Do I have to switch anything to attend?",
                  a: "Nothing. Most people on this list are just watching us build."
                },
                {
                  q: "What if my church is smaller than your target?",
                  a: "Come anyway. The session is open to any size, and your input still shapes what we build."
                },
                {
                  q: "We're a nonprofit, not a church. Does this apply?",
                  a: "Yes. The same problems show up in donor management and fund accounting. Tell us your role on the form and we'll route you to the right session."
                },
                {
                  q: "What happens to my information?",
                  a: "We use it to send you the session invite and, only if you separately opt in, weekly build updates. We do not sell or share it."
                }
              ].map((faq, i) => (
                <details key={i} className="group bg-[#F5F1E8] rounded border border-[rgba(20,33,61,0.13)] overflow-hidden">
                  <summary className="flex cursor-pointer items-center justify-between p-6 font-serif text-lg font-bold text-[#14213D] list-none">
                    {faq.q}
                    <span className="ml-4 flex-shrink-0 text-[#C9992E] transition duration-300 group-open:-rotate-180">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </span>
                  </summary>
                  <div className="px-6 pb-6 text-[#41506F] leading-relaxed border-t border-[rgba(20,33,61,0.05)] pt-4">
                    {faq.a}
                  </div>
                </details>
              ))}
            </div>
            
            <div className="mt-12 text-center">
              <p className="text-sm font-mono text-[#41506F]">
                See our <Link href="/legal/privacy-policy" className="text-[#8C5A33] hover:underline">Privacy Policy</Link> and <Link href="/legal/terms-of-service" className="text-[#8C5A33] hover:underline">Terms</Link>.
              </p>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
