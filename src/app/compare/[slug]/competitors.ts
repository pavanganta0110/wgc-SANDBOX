// Per-competitor content for the /compare/wgc-vs-[slug] pages. Each entry is
// genuinely distinct prose grounded in that vendor's actual fee mechanics
// (researched September 2026 — see /compare/page.tsx's own source note),
// not a single template with the name swapped in. A "when they might still
// make sense" section is included deliberately on every page — an entirely
// one-sided page reads as a doorway page to both readers and search
// engines; a specific, honest carve-out is what makes each page unique
// content rather than a find-and-replace of the one before it.

export type CompetitorFaq = { question: string; answer: string };

export type Competitor = {
  slug: string;
  name: string;
  shortName: string; // for headlines where "Tithe.ly" reads awkwardly mid-sentence
  tagline: string;
  card: string;
  ach: string;
  platformFee: string;
  overview: string;
  differentiators: { title: string; body: string }[];
  whenTheyMakeSense: string;
  faqs: CompetitorFaq[];
};

export const COMPETITORS: Competitor[] = [
  {
    slug: "wgc-vs-tithely",
    name: "Tithe.ly",
    shortName: "Tithe.ly",
    tagline: "Where the ACH savings and the real platform cost actually show up.",
    card: "2.9% + $0.30 (2.5% + $0.25 on Pro)",
    ach: "~1%",
    platformFee: "$0–$119/mo",
    overview:
      "Tithe.ly is often the first platform a small church tries — the free tier is easy to start on. The catch is what \"free\" actually includes, and what happens to ACH fees once giving grows past a handful of transactions a week.",
    differentiators: [
      {
        title: "Flat ACH vs. a percentage that scales with the gift",
        body: "WGC charges a flat 25¢ per ACH transfer, full stop. Tithe.ly charges roughly 1%. On a single $1,000 bank-transfer tithe, that's 25¢ with WGC versus about $10 with Tithe.ly — and the gap only widens as the gift gets bigger.",
      },
      {
        title: "What \"free\" doesn't include",
        body: "Tithe.ly's free tier is a hosted giving form only. Recurring giving emails, dashboards, reporting, donor profiles, and the mobile app all require the Pro plan at roughly $119/month. WGC's $10/month includes all of that — donor management, reporting, settlements, refunds, statements, and team accounts — from the first gift.",
      },
      {
        title: "A capped card rate",
        body: "WGC caps card processing at 2.3% + $0.25. Tithe.ly's base rate is 2.9% + $0.30 (2.5% + $0.25 once you're on Pro) — so even the discounted Tithe.ly rate sits above WGC's cap.",
      },
    ],
    whenTheyMakeSense:
      "If your church is already deep into Tithe.ly's broader church-management suite — check-ins, groups, the shared Tithe.ly app — and years of donor history live there, the switching effort may outweigh the fee savings in the short term. Our migration guide walks through what actually moves and what doesn't.",
    faqs: [
      {
        question: "Is WGC actually cheaper than Tithe.ly?",
        answer: "On ACH-heavy giving, yes, clearly — a flat 25¢ beats a ~1% fee on anything over a few dollars. On cards, WGC's 2.3% + $0.25 cap is below Tithe.ly's 2.9% + $0.30 base rate and roughly in line with Tithe.ly's discounted Pro rate. The platform fee is also simpler: one flat $10/month with everything included, versus Tithe.ly's free-tier-plus-$119-Pro-tier structure.",
      },
      {
        question: "Does WGC have a free tier like Tithe.ly?",
        answer: "No — WGC is a flat $10/month from day one, but that one tier includes the full dashboard: donor profiles, recurring giving, reporting, settlements, refunds, statements, and team accounts. There's no stripped-down free version that later requires an upgrade to get basic features.",
      },
    ],
  },
  {
    slug: "wgc-vs-pushpay",
    name: "Pushpay",
    shortName: "Pushpay",
    tagline: "Enterprise-grade engagement tools, enterprise-grade pricing you can't see in advance.",
    card: "2.9% + $0.30",
    ach: "1% + $0.30",
    platformFee: "Quote-based, ~$200–1,475+/mo",
    overview:
      "Pushpay is built for large, multi-site churches with a digital ministries team that will actually use its deep donor-journey automation and custom-branded app. That depth comes at enterprise pricing that Pushpay doesn't publish.",
    differentiators: [
      {
        title: "Pricing you can see before you talk to sales",
        body: "Pushpay has no public pricing page. Independent teardowns put a 1,500-member church near $17,700 a year before per-transaction fees. WGC's entire fee structure — card, ACH, and platform fee — is public on our pricing page.",
      },
      {
        title: "Flat ACH vs. a percentage plus a flat fee",
        body: "WGC charges a flat 25¢ per ACH transfer. Pushpay charges 1% + $0.30 — a percentage on top of a flat fee, on every single bank transfer.",
      },
      {
        title: "Paying for features you'll use",
        body: "Pushpay's pricing reflects an engagement platform — donor journeys, segmentation, deep ChMS integrations. Below roughly 1,000 regular attenders, most churches don't use enough of that feature set to justify the bill. WGC's $10/month covers the giving infrastructure itself without the engagement-platform markup.",
      },
    ],
    whenTheyMakeSense:
      "Multi-site churches with a paid digital ministries director, real appetite for donor segmentation and automated giving journeys, and integrations across a broader ChMS/CRM stack — that's exactly where Pushpay's depth earns its price tag.",
    faqs: [
      {
        question: "Why doesn't Pushpay publish its pricing?",
        answer: "Pushpay sells an enterprise engagement platform with custom, negotiated contracts rather than flat public tiers — which is common at that end of the market, but it means you can't compare costs without a sales conversation. WGC publishes its full card rate, ACH rate, and platform fee openly.",
      },
      {
        question: "Is Pushpay worth it for a smaller church?",
        answer: "Usually not. Pushpay's value is concentrated in its deep donor-engagement and automation features, which mostly go underused below roughly 1,000 regular attenders — at that scale, a flat-rate platform like WGC typically covers the same core giving needs for a fraction of the cost.",
      },
    ],
  },
  {
    slug: "wgc-vs-givebutter",
    name: "Givebutter",
    shortName: "Givebutter",
    tagline: "Free at the platform level — funded by a tip prompt on every single gift.",
    card: "2.9% + $0.30",
    ach: "2.9% + $0.30",
    platformFee: "$0 (optional donor tip)",
    overview:
      "Givebutter doesn't charge a monthly platform fee — it funds itself through a tip prompt shown to the donor on every gift. That model fits campaigns and peer-to-peer fundraisers well; it's a different fit for a weekly tithing rhythm.",
    differentiators: [
      {
        title: "\"Free\" isn't the same as \"costless\"",
        body: "Many donors leave a tip when prompted, which puts Givebutter's effective cost in a similar 3–5% range to a platform with a flat monthly fee — it's a different mechanism for recovering revenue, not necessarily a lower total cost to the organization.",
      },
      {
        title: "Flat ACH vs. the same rate as cards",
        body: "Givebutter charges 2.9% + $0.30 on ACH — the identical rate it charges on cards. WGC charges a flat 25¢ on every ACH transfer, regardless of size.",
      },
      {
        title: "Built for weekly giving, not just campaigns",
        body: "Givebutter's product is rooted in nonprofit fundraisers and peer-to-peer campaigns, where a tip prompt feels natural. WGC is built around the steady, recurring rhythm of weekly or biweekly church giving, where a repeated tip ask can feel out of place to regular givers.",
      },
    ],
    whenTheyMakeSense:
      "Capital campaigns, mission trips, peer-to-peer fundraisers, and one-time event fundraising — contexts where a donor expects to be asked for a little extra, and Givebutter's free-platform model genuinely shines.",
    faqs: [
      {
        question: "Is Givebutter actually free compared to WGC's $10/month fee?",
        answer: "Givebutter doesn't charge the organization a subscription fee, but it recovers revenue through a tip prompt shown to the donor on each gift. Many donors tip, which puts Givebutter's effective cost in a comparable range to WGC's flat fee — it's a different mechanism, not automatically a lower total cost.",
      },
      {
        question: "Does the tip prompt bother regular weekly givers?",
        answer: "It can. Givebutter's tip-on-top model is well suited to one-time campaign gifts, where an ask for a little extra feels natural. For a recurring Sunday-offering rhythm, the same prompt repeated every week is a friction point some congregations notice.",
      },
    ],
  },
  {
    slug: "wgc-vs-subsplash",
    name: "Subsplash",
    shortName: "Subsplash",
    tagline: "A full app-and-media bundle — you can't buy just the giving piece.",
    card: "2.3%–2.99% + $0.30",
    ach: "1%",
    platformFee: "Quote-based, from ~$159/mo",
    overview:
      "Subsplash sells giving as part of a larger bundle — app, website, sermon hosting, and media, all under one contract. That's the whole value proposition, and it means you can't buy the giving tool on its own.",
    differentiators: [
      {
        title: "Unbundled vs. bundled",
        body: "WGC is giving and payments only — you pay $10/month whether or not you need an app or website. Subsplash's giving tool comes attached to its broader platform starting around $159/month, so you're paying for the bundle even if you only need the giving piece.",
      },
      {
        title: "Flat ACH vs. a percentage",
        body: "WGC charges a flat 25¢ per ACH transfer. Subsplash charges roughly 1% on the same transfer.",
      },
      {
        title: "No duplicate spend if you already have a website or app",
        body: "If your church already has a website and doesn't need a custom-branded mobile app, Subsplash's bundle pricing covers features you won't use. WGC adds giving to whatever site or app you already have.",
      },
    ],
    whenTheyMakeSense:
      "Churches that genuinely want one vendor and one contract for app, website, sermon hosting, media, and giving — the bundle math works out well when you'd otherwise be paying for several of those tools separately.",
    faqs: [
      {
        question: "Can I use Subsplash for giving only, without the app and website?",
        answer: "No — Subsplash doesn't sell its giving tool as a standalone product. It's part of the broader app/website/media bundle, which is the right fit if you want all of those from one vendor, but not if you only need payment processing.",
      },
      {
        question: "Is WGC's ACH rate actually lower than Subsplash's?",
        answer: "Yes — WGC charges a flat 25¢ per ACH transfer regardless of size, while Subsplash charges roughly 1%. On a $1,000 bank-transfer gift, that's 25¢ versus roughly $10.",
      },
    ],
  },
  {
    slug: "wgc-vs-givelify",
    name: "Givelify",
    shortName: "Givelify",
    tagline: "A donor-discovery app with no published ACH rate at all.",
    card: "2.9% + $0.30 (1.5% + $0.30 on Plus)",
    ach: "N/A",
    platformFee: "$0 ($99/mo for Plus)",
    overview:
      "Givelify works differently from the rest of this list — it's as much a donor-discovery app (donors browse and find churches inside the Givelify app itself) as it is a payment processor, and it only accepts card and digital-wallet gifts.",
    differentiators: [
      {
        title: "No ACH option",
        body: "Givelify has no published ACH rate — every donation runs through a card or digital wallet. WGC supports flat-rate ACH at 25¢ per transfer, which matters for donors who prefer giving by bank transfer, especially on larger gifts.",
      },
      {
        title: "Free tier vs. Plus, still card-only",
        body: "Givelify's free tier runs 2.9% + $0.30 per card gift; the $99/month Plus tier drops that to 1.5% + $0.30. Neither tier adds ACH. WGC's single $10/month tier includes both card and flat-rate ACH processing.",
      },
      {
        title: "A full giving platform, not just a giving button",
        body: "WGC includes donor profiles, campaign pages, invoicing, and reporting as part of the core platform. Givelify's core strength is donor discovery and a simple giving button inside its own app, rather than a full back-office giving platform.",
      },
    ],
    whenTheyMakeSense:
      "If reaching donors who browse for churches to support directly inside the Givelify app is valuable to your organization, that discovery feature is a real, distinct value Givelify offers that isn't about processing fees at all.",
    faqs: [
      {
        question: "Does Givelify support ACH / bank transfer giving?",
        answer: "No — Givelify has no published ACH rate and processes gifts by card or digital wallet only. WGC supports a flat 25¢ ACH rate alongside card processing.",
      },
      {
        question: "What's the real difference between Givelify and a platform like WGC?",
        answer: "Givelify is partly a donor-discovery app — donors can find and give to churches browsing inside the Givelify app itself. WGC is a full back-office giving platform: donor profiles, campaigns, invoicing, reporting, and ACH support, embedded in your own organization's giving page rather than a shared discovery app.",
      },
    ],
  },
  {
    slug: "wgc-vs-donorbox",
    name: "Donorbox",
    shortName: "Donorbox",
    tagline: "Two fees stack on every single gift — the processor's cut and Donorbox's own cut.",
    card: "~2.2% + $0.30 processor fee, plus a 2.95% platform fee (Standard)",
    ach: "Same stacked fee structure",
    platformFee: "$0–$150/mo",
    overview:
      "Donorbox's free Standard plan looks simple at first glance, but every gift actually passes through two separate fees: the underlying payment processor's cut, plus Donorbox's own platform fee on top.",
    differentiators: [
      {
        title: "One fee vs. two stacked fees",
        body: "On Donorbox's Standard plan, a gift is charged roughly 2.2% + $0.30 by the underlying processor (Stripe or PayPal), and then an additional 2.95% platform fee by Donorbox itself — compounding on every transaction. WGC charges one fee: 2.3% + $0.25 on cards, capped.",
      },
      {
        title: "Flat ACH vs. the same stacked structure",
        body: "WGC charges a flat 25¢ per ACH transfer. Donorbox applies its same stacked processor-plus-platform fee structure to ACH gifts as well.",
      },
      {
        title: "The lower tier costs $150/month",
        body: "Donorbox's reduced 1.75–2% platform fee is only available on its Pro plan at $150/month. WGC's single $10/month tier already includes the full dashboard — no second, more expensive tier required to bring the percentage down.",
      },
    ],
    whenTheyMakeSense:
      "Nonprofits running occasional one-off campaigns who want Donorbox's straightforward setup and don't mind the stacked fee showing up quietly on every receipt — for infrequent giving, the simplicity can outweigh the per-gift cost.",
    faqs: [
      {
        question: "Why does Donorbox charge two separate fees?",
        answer: "Donorbox's free Standard plan passes through the underlying payment processor's own fee (Stripe or PayPal, roughly 2.2% + $0.30) and adds its own 2.95% platform fee on top of every gift. The two compound, so the real cost on a Standard-plan gift is noticeably higher than either fee looks on its own.",
      },
      {
        question: "How do I get Donorbox's lower fee rate?",
        answer: "Donorbox's reduced 1.75–2% platform fee requires upgrading to its Pro plan at $150/month. WGC includes its full feature set — donor management, reporting, settlements, refunds, statements, and team accounts — in the single $10/month tier, with no separate upgrade needed to reduce transaction costs.",
      },
    ],
  },
  {
    slug: "wgc-vs-planning-center-giving",
    name: "Planning Center Giving",
    shortName: "Planning Center",
    tagline: "The closest ACH rate on this list — but the subscription climbs with your growth.",
    card: "2.15% + $0.30",
    ach: "$0.30 flat",
    platformFee: "$0–$239/mo (by donation volume)",
    overview:
      "Planning Center Giving is one of the few platforms here that also charges a flat ACH fee rather than a percentage — the real difference with WGC shows up in how its subscription price climbs as your organization's donation volume grows.",
    differentiators: [
      {
        title: "A subscription that scales with volume",
        body: "Planning Center Giving's monthly fee ranges from $0 up to $239/month, tiered by how many donations you process. WGC's $10/month is flat regardless of volume — a growing organization doesn't get a bigger bill just for processing more gifts.",
      },
      {
        title: "Both charge flat ACH — the cap on cards is where WGC pulls ahead",
        body: "Planning Center's $0.30 flat ACH fee is close to WGC's 25¢. The bigger gap is on cards: WGC caps card processing at 2.3% + $0.25, which matters more as individual gift sizes grow, while Planning Center charges 2.15% + $0.30 with no stated cap.",
      },
      {
        title: "One ecosystem vs. a dedicated giving platform",
        body: "Planning Center Giving is one module inside the broader Planning Center suite (check-ins, services, groups). WGC is purpose-built around giving and payments specifically, with donor management, reporting, and settlements designed around that single job.",
      },
    ],
    whenTheyMakeSense:
      "Churches already running the full Planning Center suite — services planning, check-ins, groups — where keeping giving inside the same ecosystem outweighs a few points of difference on fees.",
    faqs: [
      {
        question: "Does Planning Center Giving charge a percentage on ACH like most other platforms?",
        answer: "No — Planning Center Giving charges a flat $0.30 per ACH transfer, one of the few platforms on this list that doesn't charge a percentage on bank transfers. WGC's flat ACH rate is slightly lower, at 25¢.",
      },
      {
        question: "Why does Planning Center's bill grow as our church grows?",
        answer: "Its subscription is tiered by donation volume — the more donations you process per month, the higher the tier and the higher the monthly fee, up to $239/month at the top end. WGC's $10/month platform fee doesn't change based on how many gifts you process.",
      },
    ],
  },
  {
    slug: "wgc-vs-vanco",
    name: "Vanco Faith",
    shortName: "Vanco",
    tagline: "ACH still carries a percentage on top of a flat fee — plus compliance fees to watch for.",
    card: "2.9% + $0.45 (2.65% + $0.39 on Thrive)",
    ach: "1% + $0.45 (0.9% + $0.39 on Thrive)",
    platformFee: "$0–$54/mo",
    overview:
      "Vanco is a longtime player across churches, schools, and other organizations' payment needs. Its ACH pricing still carries a percentage on top of a flat per-transaction fee, and a few additional fees are worth knowing about up front.",
    differentiators: [
      {
        title: "ACH isn't actually flat-rate",
        body: "Vanco charges 1% + $0.45 on its Grow plan (0.9% + $0.39 on Thrive) for ACH transfers — a percentage stacked on top of a flat fee. WGC charges a flat 25¢ with nothing added, regardless of the gift size.",
      },
      {
        title: "Watch for onboarding and compliance fees",
        body: "Vanco can add a $10/month fee if onboarding steps (like a Giving Specialist meeting) aren't completed within set windows, plus a separate $23.95/month fee for organizations that aren't PCI compliant. WGC includes PCI Level 1 compliance as part of the platform.",
      },
      {
        title: "A higher flat fee on every card transaction",
        body: "Vanco's card rate includes a $0.45 flat fee per transaction on its Grow plan — noticeably higher than WGC's $0.25 flat fee, which adds up quickly on smaller, frequent gifts.",
      },
    ],
    whenTheyMakeSense:
      "Organizations already using Vanco for other payment needs — school activity fees, event registration — where consolidating onto one vendor across several use cases outweighs a few points of difference in giving-specific fees.",
    faqs: [
      {
        question: "Does Vanco charge a flat rate on ACH like WGC?",
        answer: "No — Vanco charges a percentage (1% on its Grow plan, 0.9% on Thrive) plus a flat fee on every ACH transfer. WGC charges a flat 25¢ with no percentage component at all.",
      },
      {
        question: "What other fees should I know about with Vanco?",
        answer: "Vanco can charge a $10/month fee if onboarding isn't completed within its set timeline, plus a separate $23.95/month fee for organizations not PCI compliant. WGC's $10/month platform fee includes PCI Level 1 compliance with no separate compliance surcharge.",
      },
    ],
  },
  {
    slug: "wgc-vs-breeze-chms",
    name: "Breeze ChMS",
    shortName: "Breeze",
    tagline: "A church-management bundle — giving fees now inherited from its new owner, Tithe.ly.",
    card: "~2.9% + $0.30",
    ach: "~1%",
    platformFee: "~$67–$119/mo",
    overview:
      "Breeze is best known as an affordable, flat-rate church management system — giving is one module inside that bundle, with rates that now follow Tithe.ly's pricing since Tithe.ly's acquisition of Breeze.",
    differentiators: [
      {
        title: "Giving isn't the product — the ChMS is",
        body: "Breeze's core value is its church management system (people database, check-ins, events). Giving rides along as a feature inside that ~$67–$119/month bundle, rather than being the dedicated focus the way it is with WGC.",
      },
      {
        title: "Flat ACH vs. a percentage",
        body: "WGC charges a flat 25¢ per ACH transfer. Breeze's giving fees — inherited from Tithe.ly — run roughly 1% on ACH transfers.",
      },
      {
        title: "Paying for a ChMS you may not need",
        body: "If your church doesn't need a full people-management system, paying $67–$119/month for Breeze just to get giving costs more than WGC's dedicated $10/month giving platform.",
      },
    ],
    whenTheyMakeSense:
      "Churches that want an affordable, all-in-one ChMS-plus-giving bundle and don't need WGC's deeper payment-specific features — the combined price can make sense if you're using both halves of what Breeze offers.",
    faqs: [
      {
        question: "Is Breeze's giving the same as Tithe.ly's now?",
        answer: "Breeze was acquired by Tithe.ly, and its giving fees have moved toward Tithe.ly's own rate structure — roughly 2.9% + $0.30 on cards and about 1% on ACH. WGC's rates are unaffected by that acquisition and remain a flat 25¢ ACH with a capped 2.3% + $0.25 card rate.",
      },
      {
        question: "Should I use Breeze just for the giving feature?",
        answer: "Probably not, if giving is your main need — Breeze's price reflects its full church management bundle. A dedicated giving platform like WGC, at $10/month, is typically the better fit if you don't also need the ChMS side.",
      },
    ],
  },
];

export const COMPETITOR_SLUGS = COMPETITORS.map((c) => c.slug);

export function getCompetitor(slug: string): Competitor | undefined {
  return COMPETITORS.find((c) => c.slug === slug);
}
