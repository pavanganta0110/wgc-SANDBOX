import { headers } from "next/headers";
import { partnerKeyEnvironment } from "@/lib/partners/partnerApiKeys";

export const metadata = { title: "Docs | Partner dashboard" };
export const dynamic = "force-dynamic";

const ENDPOINTS: [string, string][] = [
  ["GET /api/v1/partner/organizations", "Your organizations, with your own reference for each (for example a CRM location ID)."],
  ["GET /api/v1/partner/ledger?from&to", "Every gift in a date window: online, recurring, and cash or check. One row per gift: amounts in cents, fees, net, donor, designation, refunds, disputes, payout."],
  ["GET /api/v1/partner/donors", "Donors of your organizations."],
  ["GET /api/v1/partner/recurring", "Recurring schedules: donor, amount, interval, status (ACTIVE, PAST_DUE, CANCELED, ...), next charge date and the last failure. Optional donorId, status."],
  ["GET /api/v1/partner/settlements", "Payouts (settlements) of your organizations."],
  ["GET /api/v1/partner/giving-links", "Giving links, with the net amount collected. Optional status."],
  ["GET /api/v1/partner/campaigns", "Fundraising campaigns and the amount raised. Optional status."],
  ["GET /api/v1/partner/onboarding", "Where each application stands: submitted, under_review, information_required (with what is missing), approved, rejected."],
];

const EVENTS: [string, string][] = [
  ["donation.created", "A gift succeeded: online, a recurring charge, or a cash or check gift recorded by the organization. data.ledger is the full gift row (ledger.source is WGC or EXTERNAL)."],
  ["donation.updated", "A cash or check gift was edited. data.ledger is the new row."],
  ["donation.voided", "A cash or check gift was voided. data.ledger.voided is true."],
  ["donation.refunded", "A gift was refunded. data.ledger carries the new refunded amount."],
  ["donation.returned", "An ACH gift was returned by the bank. data.ledger.returned is true."],
  ["donation.disputed", "A donor disputed a gift, or the dispute changed state (won, lost, expired). data.ledger.disputeState is the state."],
  ["donor.created / donor.updated", "A donor record was created or changed."],
  ["recurring.created / updated / cancelled", "A recurring schedule started, changed or ended."],
  ["recurring.payment_failed / payment_recovered / retry_scheduled / cancelled_after_failure", "The life of a failing recurring gift."],
  ["settlement.created", "A payout was recorded."],
  ["invoice.created / invoice.paid", "An organization's invoice."],
  ["campaign.*, fundraiser.*, team.*", "Fundraising campaigns, fundraisers and teams."],
  ["onboarding.submitted", "An application was submitted."],
  ["onboarding.under_review", "It is being reviewed."],
  ["onboarding.information_required", "More information is needed. data.requestedItems lists it; data.updateUrl is a one-time link where the organization uploads it (valid 7 days). Show it inside your screen."],
  ["onboarding.information_submitted", "The organization answered; the application is back under review."],
  ["onboarding.approved", "Approved. organization.id is now set."],
  ["onboarding.rejected", "Rejected."],
];

const VERIFY = `import crypto from "node:crypto";

// rawBody: the request body exactly as received (a string, not parsed JSON)
// header:  the value of the WGC-Signature header, "timestamp=<unix>,sig=<hex>"
// secret:  your signing secret (whsec_...)
export function verifyWgcSignature(rawBody, header, secret, maxAgeSeconds = 300) {
  const m = /^timestamp=(\\d+),sig=([0-9a-f]+)$/.exec(header || "");
  if (!m) return false;
  if (Math.abs(Date.now() / 1000 - Number(m[1])) > maxAgeSeconds) return false;
  const expected = crypto.createHmac("sha256", secret).update(\`\${m[1]}:\${rawBody}\`).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(m[2], "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}`;

const PAYLOAD = `{
  "id": "evt_...",
  "type": "donation.created",
  "createdAt": "2026-11-03T16:30:00.000Z",
  "organization": { "id": "cm...", "name": "Grace Community Church", "reference": "loc_123" },
  "data": { "paymentId": "...", "ledger": { "id": "...", "giftCents": 5000, "...": "..." } }
}`;

function Code({ children }: { children: string }) {
  return <pre className="overflow-x-auto rounded-lg bg-slate-900 text-slate-100 text-xs p-4">{children}</pre>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
      <h3 className="text-sm font-bold text-slate-900">{title}</h3>
      <div className="text-sm text-slate-700 space-y-3">{children}</div>
    </section>
  );
}

export default async function PartnerDocsPage() {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") || headerList.get("host") || "your WGC address";
  const proto = host.startsWith("localhost") ? "http" : "https";
  const base = `${proto}://${host}`;
  const live = partnerKeyEnvironment() === "live";

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Docs</h2>
        <p className="text-sm text-slate-500 mt-1">How to read your merchants&apos; data and get notified. This page is the {live ? "production" : "sandbox"} guide.</p>
      </div>

      <Section title="Sandbox and production">
        <p>
          Sandbox and production are separate: separate sign-ins, keys and webhooks. A sandbox key only works here (<code>{base}</code>) and starts with <code>wgc_ptr_test_</code>; a production key starts with <code>wgc_ptr_live_</code>. Test with a sandbox
          organization and the test card <code>4111 1111 1111 1111</code>. Nothing from sandbox reaches production.
        </p>
      </Section>

      <Section title="Authentication">
        <p>
          Create a key on the <strong>API Key</strong> page. It is read-only, shown once, and reads every organization linked to your account. Send it as a Bearer token:
        </p>
        <Code>{`curl "${base}/api/v1/partner/organizations" \\\n  -H "Authorization: Bearer wgc_ptr_..."`}</Code>
        <p>Which organizations a key can read is decided by the key alone. Pass <code>organization=&lt;WGC id or your reference&gt;</code> to look at one of yours; anything else answers 404.</p>
      </Section>

      <Section title="Endpoints">
        <ul className="space-y-2">
          {ENDPOINTS.map(([path, text]) => (
            <li key={path}>
              <code className="font-semibold text-slate-900">{path}</code>
              <div className="text-slate-600">{text}</div>
            </li>
          ))}
        </ul>
        <p>
          <strong>Paging.</strong> Lists return <code>limit</code> rows (default 25, up to 100; the ledger defaults to 500, up to 1000). Keep calling with <code>cursor=&lt;nextCursor&gt;</code> until <code>hasMore</code> is false (the ledger returns <code>nextCursor: null</code> at the end). Every row
          has an <code>organization</code> {"{ id, name, reference }"}. Money is always whole cents. Dates are ISO 8601, UTC.
        </p>
        <p>
          <strong>Ledger.</strong> <code>from</code> is inclusive and <code>to</code> is exclusive, at most 366 days: a calendar year is <code>from=2026-01-01&amp;to=2027-01-01</code>. Rows are ordered by date, so no gift is skipped or repeated while new ones arrive.
        </p>
        <p>
          <strong>Errors and limits.</strong> <code>401</code> missing, wrong or revoked key; <code>404</code> not one of your organizations; <code>400</code> a bad date or cursor; <code>429</code> too many requests (120 a minute per key). Errors look like{" "}
          <code>{`{ "error": { "type", "message", "requestId" } }`}</code>; quote the <code>requestId</code> if you contact us. The API Key page shows each key&apos;s requests and errors.
        </p>
      </Section>

      <Section title="Webhook">
        <p>
          Set one https address on the <strong>Webhook</strong> page and tick the events you want. Every event of every organization linked to you arrives there, tagged with the organization, so one receiver is enough. Use <strong>Send test event</strong> to check it.
        </p>
        <Code>{PAYLOAD}</Code>
        <p>
          <strong>Verify every request.</strong> The <code>WGC-Signature</code> header is <code>timestamp=&lt;unix&gt;,sig=&lt;hex&gt;</code>, an HMAC-SHA256 of <code>timestamp:rawBody</code> with your signing secret. Answer with any 2xx within 10 seconds. A failed delivery is retried
          (1 minute, 5 minutes, 30 minutes, 2 hours, 12 hours) and the endpoint is switched off after 20 failures in a row; the Webhook page shows delivery results.
        </p>
        <Code>{VERIFY}</Code>
        <p>The same event can arrive more than once; use the event <code>id</code> to ignore a repeat.</p>
        <h4 className="font-semibold text-slate-900">Events</h4>
        <ul className="space-y-2">
          {EVENTS.map(([name, text]) => (
            <li key={name}>
              <code className="font-semibold text-slate-900">{name}</code>
              <div className="text-slate-600">{text}</div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Onboarding inside your screen">
        <p>
          WGC gives you a Get Started code. For each organization, open <code>{`${base}/start?partner=<code>&embed=1&ref=<your id for it>`}</code> inside your screen (an iframe on a domain WGC has allowed). You can prefill with <code>org</code>, <code>name</code>, <code>email</code>,{" "}
          <code>phone</code> and <code>website</code>. With <code>embed=1</code> there is no WGC header, footer or marketing text. Follow the application with the <code>onboarding.*</code> events and show <code>data.updateUrl</code> when more information is needed. When it is approved
          the organization appears in your organizations list and its gifts flow into your ledger.
        </p>
      </Section>

      <Section title="Billing">
        <p>
          You pay WGC; your merchants are never billed. Each month your saved card is charged the price per approved merchant (shown on the Billing page) for every merchant counted. A merchant counts from the month after it was approved, so every new approval raises the next charge.
          Invoices and receipts are on the Billing page. A declined card is retried the next day; save a new card there to try again at once.
        </p>
      </Section>
    </div>
  );
}
