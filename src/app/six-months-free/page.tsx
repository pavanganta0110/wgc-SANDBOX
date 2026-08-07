"use client";

import Link from "next/link";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import SixMonthsFreeStartButton from "@/components/marketing/SixMonthsFreeStartButton";

export default function SixMonthsFreePage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Header />
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap');

        #smf-wrapper {
          --gold:#eab308; --gold-deep:#c48f09; --gold-soft:#f5d372;
          --ink:#1a1d29; --ink-soft:#3a3f4f;
          --stone-50:#faf8f3; --stone-100:#f2ede3; --stone-200:#e4ddcd;
          --stone-400:#a89f8c; --stone-500:#7a7466; --line:#e6dfd0;
          --paper:#ffffff; --ok:#3f7d52;
          --radius:14px; --shadow:0 18px 50px -20px rgba(26,29,41,.4);
          --maxw:1160px;
          font-family:'Inter',system-ui,sans-serif;
          color:var(--ink);
          line-height:1.55;
          background:var(--paper);
        }
        #smf-wrapper * { box-sizing:border-box; margin:0; padding:0; }
        #smf-wrapper a { text-decoration:none; color:inherit; }
        #smf-wrapper .wrap { max-width:var(--maxw); margin:0 auto; padding:0 26px; }

        /* ---------- HERO ---------- */
        #smf-wrapper .hero { position:relative; min-height:100vh; display:flex; align-items:center; justify-content:center; text-align:center; overflow:hidden; background:radial-gradient(120% 90% at 50% 8%, #4a2f14 0%, #2a1a10 42%, #14100b 100%); }
        #smf-wrapper .hero video { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; z-index:0; }
        #smf-wrapper .hero .veil { position:absolute; inset:0; z-index:1; background:linear-gradient(180deg, rgba(10,8,6,.55) 0%, rgba(12,9,7,.35) 38%, rgba(10,8,6,.72) 100%), radial-gradient(90% 70% at 50% 40%, rgba(234,179,8,.10), rgba(10,8,6,0) 60%); }
        #smf-wrapper .hero .glow { position:absolute; left:50%; top:-10%; transform:translateX(-50%); width:900px; height:520px; z-index:1; background:radial-gradient(closest-side, rgba(245,180,60,.28), rgba(245,180,60,0)); filter:blur(10px); pointer-events:none; }
        #smf-wrapper .hero-content { position:relative; z-index:5; padding:120px 22px 80px; max-width:900px; }
        #smf-wrapper .eyebrow { display:inline-block; background:rgba(63,125,82,.9); color:#eafaef; font-size:12.5px; font-weight:600; letter-spacing:.3px; padding:7px 16px; border-radius:99px; margin-bottom:26px; backdrop-filter:blur(4px); border:1px solid rgba(255,255,255,.15); }
        #smf-wrapper .hero h1 { font-family:'Fraunces',serif !important; font-weight:600 !important; color:#fff !important; font-size:clamp(38px,6.2vw,74px) !important; line-height:1.03 !important; letter-spacing:-1px !important; text-shadow:0 4px 30px rgba(0,0,0,.5) !important; margin:0 !important; }
        #smf-wrapper .hero p.lede { color:rgba(255,255,255,.9) !important; font-size:clamp(16px,2vw,20px) !important; line-height:1.55 !important; max-width:640px; margin:24px auto 0 !important; text-shadow:0 2px 14px rgba(0,0,0,.55) !important; }
        #smf-wrapper .hero .cta-row { margin-top:38px; display:flex; gap:14px; justify-content:center; flex-wrap:wrap; }
        #smf-wrapper .btn-primary { font-family:'Inter' !important; font-weight:700 !important; font-size:17px !important; color:var(--ink) !important; background:linear-gradient(135deg,var(--gold-soft),var(--gold-deep)) !important; border:none !important; border-radius:14px !important; padding:17px 34px !important; cursor:pointer !important; display:inline-flex !important; align-items:center !important; justify-content:center !important; gap:10px !important; box-shadow:0 14px 34px -12px rgba(234,179,8,.75) !important; transition:transform .12s,box-shadow .15s !important; text-decoration:none !important; }
        #smf-wrapper .btn-primary:hover { transform:translateY(-2px) !important; box-shadow:0 18px 40px -12px rgba(234,179,8,.85) !important; }
        #smf-wrapper .btn-ghost { font-family:'Inter'; font-weight:700; font-size:16px; color:#ffe9a8; background:rgba(245,211,114,.10); border:1px solid rgba(245,211,114,.55); border-radius:14px; padding:16px 28px; cursor:pointer; backdrop-filter:blur(6px); transition:background .15s,color .15s; }
        #smf-wrapper .btn-ghost:hover { background:rgba(245,211,114,.20); color:#fff4d6; }
        #smf-wrapper .fineprint { color:rgba(255,255,255,.62); font-size:12.5px; line-height:1.6; max-width:560px; margin:30px auto 0; }
        #smf-wrapper .scrollcue { position:absolute; bottom:26px; left:50%; transform:translateX(-50%); z-index:5; color:rgba(255,255,255,.7); font-size:11px; letter-spacing:2px; text-transform:uppercase; display:flex; flex-direction:column; align-items:center; gap:8px; }
        #smf-wrapper .scrollcue span { width:1px; height:34px; background:linear-gradient(rgba(255,255,255,.7),rgba(255,255,255,0)); animation:cue 1.8s ease-in-out infinite; }
        @keyframes cue { 0%,100% { opacity:.3; transform:scaleY(.6) } 50% { opacity:1; transform:scaleY(1) } }

        /* ---------- WALKTHROUGH ---------- */
        #smf-wrapper .walk { background:linear-gradient(180deg,#14100b 0%, #221a12 8%, var(--stone-50) 26%, var(--stone-50) 100%); padding:0 0 84px; }
        #smf-wrapper .walk .head { text-align:center; max-width:720px; margin:0 auto; padding:74px 22px 12px; }
        #smf-wrapper .walk .kick, #smf-wrapper .walk h2, #smf-wrapper .walk p.sub { background:linear-gradient(135deg,var(--gold-soft),var(--gold)); -webkit-background-clip:text; background-clip:text; color:transparent; -webkit-text-fill-color:transparent; }
        #smf-wrapper .walk .kick { font-size:12px; font-weight:700; letter-spacing:1.6px; text-transform:uppercase; margin-bottom:12px; }
        #smf-wrapper .walk h2 { font-family:'Fraunces',serif !important; font-weight:700 !important; font-size:clamp(28px,4vw,42px) !important; letter-spacing:-.5px !important; margin:0 !important; }
        #smf-wrapper .walk p.sub { font-size:16px !important; font-weight:600 !important; margin-top:14px !important; }
        #smf-wrapper .embed-shell { max-width:1090px; margin:26px auto 0; padding:0 14px; }
        #smf-wrapper .embed-shell iframe { width:100%; height:900px; border:0; border-radius:16px; background:transparent; display:block; }

        /* ---------- STATS ---------- */
        #smf-wrapper .stats { background:var(--stone-50); border-top:1px solid var(--line); }
        #smf-wrapper .stats-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:20px; padding:64px 26px; max-width:820px; margin:0 auto; text-align:center; }
        #smf-wrapper .stat .num { font-family:'Fraunces',serif !important; font-weight:700 !important; font-size:56px !important; color:var(--ink) !important; line-height:1 !important; margin:0 !important; }
        #smf-wrapper .stat .lbl { font-size:14.5px !important; color:var(--ink-soft) !important; margin-top:12px !important; max-width:230px; margin-left:auto; margin-right:auto; }
        #smf-wrapper .stat.mid { border-left:1px solid var(--line); }

        /* transparency band */
        #smf-wrapper .transparency { background:var(--stone-100); border-top:1px solid var(--line); border-bottom:1px solid var(--line); }
        #smf-wrapper .tp-inner { display:flex; align-items:center; justify-content:space-between; gap:26px; padding:34px 26px; flex-wrap:wrap; }
        #smf-wrapper .tp-inner .kick { font-size:12px; font-weight:700; letter-spacing:1.6px; text-transform:uppercase; color:var(--gold-deep); margin-bottom:8px; }
        #smf-wrapper .tp-inner p { font-size:16px !important; color:var(--ink-soft) !important; max-width:620px; margin:0 !important; }
        #smf-wrapper .tp-inner p strong { color:var(--ink); font-weight:700; }
        #smf-wrapper .btn-outline { flex:0 0 auto; font-family:'Inter' !important; font-weight:700 !important; font-size:14.5px !important; color:var(--gold-deep) !important; background:#fff !important; border:1.5px solid var(--gold) !important; border-radius:12px !important; padding:13px 22px !important; cursor:pointer !important; transition:background .15s,color .15s !important; display:inline-block !important; }
        #smf-wrapper .btn-outline:hover { background:var(--gold) !important; color:var(--ink) !important; }
        #smf-wrapper .btn-primary.btn-wide { font-size:19px !important; padding:20px 46px !important; }
        #smf-wrapper .mid-cta { background:var(--stone-50); text-align:center; padding:2px 26px 62px; }
        #smf-wrapper .demo-cta { text-align:center; margin:34px auto 0; max-width:540px; }
        #smf-wrapper .demo-cta p { font-size:15.5px !important; color:var(--ink-soft) !important; margin-bottom:14px !important; font-weight:600 !important; }

        /* ---------- VALUE ---------- */
        #smf-wrapper .value { padding:84px 26px; max-width:var(--maxw); margin:0 auto; }
        #smf-wrapper .value .head { text-align:center; max-width:680px; margin:0 auto 46px; }
        #smf-wrapper .value .kick { font-size:12px; font-weight:700; letter-spacing:1.6px; text-transform:uppercase; color:var(--gold-deep); margin-bottom:12px; }
        #smf-wrapper .value h2 { font-family:'Fraunces',serif !important; font-weight:600 !important; font-size:clamp(26px,3.6vw,38px) !important; letter-spacing:-.5px !important; margin:0 !important; color:var(--ink) !important; }
        #smf-wrapper .cards { display:grid; grid-template-columns:repeat(3,1fr); gap:22px; }
        #smf-wrapper .vcard { background:var(--paper); border:1px solid var(--line); border-radius:var(--radius); padding:28px 26px; box-shadow:0 10px 30px -22px rgba(26,29,41,.5); }
        #smf-wrapper .vcard .ic { width:46px; height:46px; border-radius:12px; display:grid; place-items:center; background:linear-gradient(135deg,#fdf3d3,#f5d372); font-size:22px; margin-bottom:16px; }
        #smf-wrapper .vcard h3 { font-family:'Fraunces',serif !important; font-weight:600 !important; font-size:20px !important; margin-bottom:8px !important; color:var(--ink) !important; }
        #smf-wrapper .vcard p { font-size:14.5px !important; color:var(--ink-soft) !important; margin:0 !important; }

        /* hero reassurance */
        #smf-wrapper .reassure { color:#ffe9a8 !important; font-size:14.5px !important; font-weight:600 !important; margin:20px auto 0 !important; max-width:560px; }

        /* FAQ */
        #smf-wrapper .faq { background:var(--paper); padding:84px 26px; }
        #smf-wrapper .faq .faq-head { text-align:center; max-width:680px; margin:0 auto 40px; }
        #smf-wrapper .faq .kick { font-size:12px; font-weight:700; letter-spacing:1.6px; text-transform:uppercase; color:var(--gold-deep); margin-bottom:12px; }
        #smf-wrapper .faq h2 { font-family:'Fraunces',serif !important; font-weight:600 !important; font-size:clamp(26px,3.6vw,38px) !important; letter-spacing:-.5px !important; margin:0 !important; color:var(--ink) !important; }
        #smf-wrapper .faq-list { max-width:780px; margin:0 auto; display:flex; flex-direction:column; gap:12px; }
        #smf-wrapper .faq details { background:var(--stone-50); border:1px solid var(--line); border-radius:12px; padding:0 20px; transition:border-color .15s; }
        #smf-wrapper .faq details[open] { border-color:var(--gold); }
        #smf-wrapper .faq summary { cursor:pointer; list-style:none; padding:18px 0; font-weight:600; font-size:16px; color:var(--ink); display:flex; justify-content:space-between; align-items:center; gap:16px; }
        #smf-wrapper .faq summary::-webkit-details-marker { display:none; }
        #smf-wrapper .faq summary::after { content:"+"; font-size:22px; color:var(--gold-deep); font-weight:400; line-height:1; }
        #smf-wrapper .faq details[open] summary::after { content:"\\2013"; }
        #smf-wrapper .faq details p { padding:0 0 18px !important; font-size:15px !important; color:var(--ink-soft) !important; line-height:1.6 !important; margin:0 !important; }

        /* ---------- CLOSING CTA ---------- */
        #smf-wrapper .closer { position:relative; overflow:hidden; text-align:center; padding:96px 26px; color:#fff; background:radial-gradient(120% 120% at 50% 0%, #4a2f14 0%, #2a1a10 48%, #14100b 100%); }
        #smf-wrapper .closer .glow { position:absolute; left:50%; top:-30%; transform:translateX(-50%); width:820px; height:520px; background:radial-gradient(closest-side, rgba(245,180,60,.22), rgba(245,180,60,0)); filter:blur(8px); }
        #smf-wrapper .closer h2 { position:relative; font-family:'Fraunces',serif !important; font-weight:600 !important; font-size:clamp(30px,4.4vw,50px) !important; letter-spacing:-.6px !important; margin:0 !important; color:#fff !important; }
        #smf-wrapper .closer p { position:relative; color:rgba(255,255,255,.85) !important; font-size:17px !important; margin:18px auto 34px !important; max-width:560px; }
        #smf-wrapper .closer .btn-primary { position:relative; z-index:10; }

        @media(max-width:860px) {
          #smf-wrapper .stats-grid { grid-template-columns:1fr; gap:36px; }
          #smf-wrapper .stat.mid { border:none; border-top:1px solid var(--line); border-bottom:1px solid var(--line); padding:30px 0; }
          #smf-wrapper .cards { grid-template-columns:1fr; }
          #smf-wrapper .embed-shell iframe { height:760px; }
        }
      `}} />

      <main id="smf-wrapper" className="flex-1">
        <section className="hero" id="start">
          <video autoPlay muted loop playsInline preload="auto" poster="https://assets.mixkit.co/videos/2796/2796-thumb-360-0.jpg">
            <source src="https://assets.mixkit.co/videos/2796/2796-360.mp4" type="video/mp4" />
            <source src="https://assets.mixkit.co/videos/515/515-360.mp4" type="video/mp4" />
          </video>
          <div className="glow"></div>
          <div className="veil"></div>

          <div className="hero-content">
            <span className="eyebrow">6 months free</span>
            <h1>Six Months Free on WGC Payments</h1>
            <p className="lede">Start accepting donations, recurring gifts, and make a bigger mission impact today. Your WGC Platform subscription is completely free for your first six months.</p>
            <div className="cta-row">
              <SixMonthsFreeStartButton className="btn-primary btn-wide">
                Set up your giving page <span aria-hidden="true">→</span>
              </SixMonthsFreeStartButton>
            </div>
            <p className="reassure">No credit card required. Just connect the bank account where you'd like your funds to land.</p>
            <p className="fineprint">Standard card, ACH, refund, dispute, and other applicable payment-processing fees still apply during the promotional period.</p>
          </div>
          <div className="scrollcue">Set up your giving page<span></span></div>
        </section>

        <section className="walk" id="walkthrough">
          <div className="head">
            <div className="kick">Interactive walkthrough</div>
            <h2>Explore your new dashboard</h2>
            <p className="sub">Step through our powerful merchant dashboard, view transaction insights, and track where your funds land. No account required.</p>
          </div>
          <div className="embed-shell">
            <iframe src="/api/demo/login" title="WGC Merchant Dashboard Walkthrough" loading="lazy"></iframe>
          </div>
          <div className="demo-cta">
            <p>Still need more info?</p>
            <a className="btn-outline" href="https://calendly.com/collinsansom/1-on-1-wgc-first-look" target="_blank" rel="noopener noreferrer">Get a live demo →</a>
          </div>
        </section>

        <section className="stats">
          <div className="stats-grid">
            <div className="stat">
              <div className="num">$0</div>
              <div className="lbl">per month for your first six months</div>
            </div>
            <div className="stat mid">
              <div className="num">$0</div>
              <div className="lbl">setup fees to get started today</div>
            </div>
          </div>
        </section>

        <div className="mid-cta">
          <SixMonthsFreeStartButton className="btn-primary btn-wide">
            Set up your giving page →
          </SixMonthsFreeStartButton>
        </div>

        <section className="transparency">
          <div className="wrap tp-inner">
            <div>
              <div className="kick">Full transparency</div>
              <p>After your first six months, your WGC Platform subscription is just <strong>$10/month</strong>. No surprises, cancel anytime.</p>
            </div>
            <Link className="btn-outline" href="/pricing">View full pricing →</Link>
          </div>
        </section>

        <section className="value">
          <div className="head">
            <div className="kick">Built for ministries &amp; nonprofits</div>
            <h2>Everything you need to receive, everything you need to make your impact</h2>
          </div>
          <div className="cards">
            <div className="vcard">
              <div className="ic">💛</div>
              <h3>Keep more of every gift</h3>
              <p>Accept one-time and recurring gifts from card or bank. Donors can cover the fees, so more of every dollar goes straight to your mission.</p>
            </div>
            <div className="vcard">
              <div className="ic">🧾</div>
              <h3>One platform, one payout</h3>
              <p>Collect giving and invoices, for property rentals or anything else, in one place, deposited to a single account instead of scattered across tools.</p>
            </div>
            <div className="vcard">
              <div className="ic">⛪</div>
              <h3>Less admin, more mission</h3>
              <p>Pricing and tools built around how churches, camps, and nonprofits actually run, so you spend less time on money and more on people.</p>
            </div>
          </div>
        </section>

        <section className="faq">
          <div className="wrap">
            <div className="faq-head">
              <div className="kick">Common questions</div>
              <h2>Answers before you sign up</h2>
            </div>
            <div className="faq-list">
              <details open>
                <summary>Do I need a credit card to start?</summary>
                <p>No. There's no card required and no setup fee. You'll connect a bank account at signup, which is simply where your funds are deposited.</p>
              </details>
              <details>
                <summary>How do I actually receive the money?</summary>
                <p>Gifts and payments settle to the bank account you connect and are deposited on a regular schedule, so funds land directly in your account with no separate transfers to chase.</p>
              </details>
              <details>
                <summary>What does it cost after the six months?</summary>
                <p>Your first six months of the WGC Platform subscription are free. After that it's $10/month and you can cancel anytime. Standard card, ACH, and related processing fees apply throughout. See full pricing for details.</p>
              </details>
              <details>
                <summary>Is it secure?</summary>
                <p>Yes. Payments run on encrypted, PCI-compliant infrastructure, so donor and payment information is protected.</p>
              </details>
              <details>
                <summary>Who can use WGC?</summary>
                <p>Churches, camps, ministries, and 501(c) nonprofits. The platform is built specifically for mission-driven organizations.</p>
              </details>
              <details>
                <summary>How long does setup take?</summary>
                <p>Typically less than an hour, depending on approval. You can walk through exactly how it works in the interactive demo above, or book a live demo.</p>
              </details>
            </div>
          </div>
        </section>

        <section className="closer">
          <div className="glow"></div>
          <h2>Start your six months free</h2>
          <p>No setup fees, no long-term commitment. Get your giving page live today and only pay standard processing along the way.</p>
          <SixMonthsFreeStartButton className="btn-primary">
            Set up your giving page <span aria-hidden="true">→</span>
          </SixMonthsFreeStartButton>
        </section>
      </main>

      <Footer />
    </div>
  );
}
