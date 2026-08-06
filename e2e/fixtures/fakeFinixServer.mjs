// A minimal local stand-in for the Finix API, used ONLY by the Playwright
// e2e suite. Started by playwright.config.ts as a second `webServer` entry
// alongside `next dev`, which is configured (via that same webServer's
// `env: { FINIX_BASE_URL: ... }`) to point every finixClient call at this
// server instead of the real Finix sandbox — this repo's real Finix
// credentials are redacted at the process level in this environment, so
// any accidental real call would fail anyway; this also means the suite
// never depends on real Finix sandbox availability at all.
//
// Deliberately vanilla Node (no TypeScript, no framework) so it can be
// launched directly via `node e2e/fixtures/fakeFinixServer.mjs` as a
// webServer `command` without a build step.
import http from "node:http";

const PORT = Number(process.env.FAKE_FINIX_PORT || 4310);

function randomId(prefix) {
  return `${prefix}_e2e_${Math.random().toString(36).slice(2, 12)}`;
}

function send(res, status, body) {
  const json = JSON.stringify(body ?? {});
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(json);
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const pathname = url.pathname;
  const method = req.method || "GET";
  const body = await readBody(req);

  // GET /merchants/:id — assertWgcBillingMerchantReady() calls this before
  // ever creating a subscription; must report APPROVED or activation fails
  // closed by design.
  if (method === "GET" && /^\/merchants\/[^/]+$/.test(pathname)) {
    return send(res, 200, {
      id: pathname.split("/").pop(),
      onboarding_state: "APPROVED",
      status: "APPROVED",
      processing_enabled: true,
      settlement_enabled: true,
    });
  }

  // POST /identities/:id/merchants — createMerchant() during onboarding.
  if (method === "POST" && /^\/identities\/[^/]+\/merchants$/.test(pathname)) {
    return send(res, 201, {
      id: randomId("MU"),
      identity: pathname.split("/")[2],
      processor: body.processor || "DUMMY_V1",
      onboarding_state: "PROVISIONING",
      processing_enabled: false,
      settlement_enabled: false,
    });
  }

  // POST /identities/:id/associated_identities — beneficial owners.
  if (method === "POST" && /^\/identities\/[^/]+\/associated_identities$/.test(pathname)) {
    return send(res, 201, { id: randomId("PI"), entity: body.entity || {} });
  }

  // POST /identities — createSellerIdentity() and createBuyerIdentity().
  if (method === "POST" && pathname === "/identities") {
    return send(res, 201, { id: randomId("ID"), entity: body.entity || {} });
  }

  // POST /payment_instruments — bank instrument (onboarding) or tokenized
  // card/bank instrument (billing activation).
  if (method === "POST" && pathname === "/payment_instruments") {
    const isBank = body.type === "BANK_ACCOUNT" || body.account_type;
    return send(res, 201, {
      id: randomId("PI"),
      enabled: true,
      brand: isBank ? null : "VISA",
      last_four: "4242",
      expiration_month: 12,
      expiration_year: new Date().getFullYear() + 4,
      bank_account_type: isBank ? "CHECKING" : null,
    });
  }

  // POST /subscriptions — activateWgcSubscription(). Mirrors a trial
  // subscription when trial_details is present (promotional signup),
  // otherwise an immediately-active subscription (normal $10/month signup).
  if (method === "POST" && pathname === "/subscriptions") {
    const now = Date.now();
    const trialDays = body.trial_details?.trial_period_days;
    if (trialDays) {
      const trialEnd = new Date(now + trialDays * 24 * 60 * 60 * 1000);
      return send(res, 201, {
        id: randomId("SU"),
        state: "TRIALING",
        trial_start: new Date(now).toISOString(),
        trial_end: trialEnd.toISOString(),
        first_charge_at: trialEnd.toISOString(),
        next_charge_date: trialEnd.toISOString(),
      });
    }
    const nextCharge = new Date(now + 30 * 24 * 60 * 60 * 1000);
    return send(res, 201, {
      id: randomId("SU"),
      state: "ACTIVE",
      next_charge_date: nextCharge.toISOString(),
    });
  }

  // DELETE /subscriptions/:id — cancelWgcSubscription().
  if (method === "DELETE" && /^\/subscriptions\/[^/]+$/.test(pathname)) {
    return send(res, 200, { id: pathname.split("/").pop(), state: "CANCELED" });
  }

  // Catch-all: return a harmless empty-ish success so any unanticipated
  // finixClient call during a test (e.g. a background sync job) never
  // crashes the dev server with a network error against a nonexistent
  // real Finix host.
  return send(res, 200, { id: randomId("MOCK") });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[fake-finix] listening on http://127.0.0.1:${PORT}`);
});
