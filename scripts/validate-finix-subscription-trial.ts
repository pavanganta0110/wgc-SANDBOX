/**
 * One-time, human-run, sandbox-only validation of the Finix subscription
 * trial request shape used by WGC's own platform-subscription billing
 * (src/lib/billing/wgcSubscriptionService.ts). Confirms — against the real
 * Finix sandbox API, never a guess — the exact accepted field names for
 * `trial_details`, and what the response actually names the trial-start/
 * trial-end/first-charge/next-charge fields and subscription state.
 *
 * This script CANNOT be run inside an automated agent session: this
 * execution environment redacts FINIX_USERNAME/FINIX_PASSWORD/FINIX_BASE_URL
 * at the process level (they literally evaluate to the string
 * "[SENSITIVE]"), so no live Finix call is possible from here. A human must
 * run this locally, with real sandbox credentials in their own shell.
 *
 * ============================================================================
 * HOW TO RUN THIS (do this locally, not in an agent session)
 * ============================================================================
 *
 * 1. Set these environment variables in your local shell (never commit them):
 *      export FINIX_ENVIRONMENT=sandbox
 *      export FINIX_BASE_URL=https://api-sandbox.finix.com   # must contain "sandbox"
 *      export FINIX_USERNAME=<your real sandbox username>
 *      export FINIX_PASSWORD=<your real sandbox password>
 *      export FINIX_VERSION=2022-02-01                        # or your configured version
 *      export WGC_VALIDATION_MERCHANT_ID=<an APPROVED sandbox WGC billing merchant id>
 *      export WGC_VALIDATION_IDENTITY_ID=<a sandbox buyer Identity id>
 *      export WGC_VALIDATION_INSTRUMENT_ID=<a sandbox Payment Instrument id, tokenized>
 *
 * 2. Run:
 *      npx tsx scripts/validate-finix-subscription-trial.ts
 *
 * 3. The script prints the exact request it's about to send (no secrets),
 *    then requires you to type "yes" to confirm before it creates anything.
 *
 * 4. Copy the sanitized response it prints (never the raw terminal output —
 *    use exactly what this script prints, which has already redacted
 *    anything sensitive) into a doc for the team, and report back:
 *      - Was `trial_details` / `trial_period_days` accepted as-is, or does
 *        Finix reject it (422) and name the real field differently?
 *      - What are the actual response field names for trial start, trial
 *        end, first charge date, and next charge date?
 *      - What `state` does the subscription come back in while trialing?
 *
 * Nothing here is saved to git — this script never writes a file, and you
 * must not paste raw credentials, card numbers, or bank account numbers into
 * any commit, PR, or doc. Only the sanitized output this script prints is
 * safe to share.
 * ============================================================================
 */

import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

const SENSITIVE_KEY_PATTERN = /(password|username|authorization|secret|token|card|account_number|bank|routing|cvv|ssn|ein)/i;

/** Recursively strips any key matching SENSITIVE_KEY_PATTERN, and masks any
 * string value that looks like a card/bank number (8+ consecutive digits),
 * so what gets printed can never leak credentials, full card numbers, or
 * bank account numbers even if the response ever accidentally includes
 * something masking didn't anticipate by key name alone. */
function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        out[key] = "[REDACTED]";
      } else {
        out[key] = redact(val);
      }
    }
    return out;
  }
  if (typeof value === "string" && /\d{8,}/.test(value.replace(/[\s-]/g, ""))) {
    return value.replace(/\d(?=\d{4})/g, "•");
  }
  return value;
}

function fail(message: string): never {
  console.error(`\nRefusing to run: ${message}\n`);
  process.exit(1);
}

async function main() {
  const environment = (process.env.FINIX_ENVIRONMENT || "").toLowerCase();
  const baseUrl = process.env.FINIX_BASE_URL || "";
  const username = process.env.FINIX_USERNAME || "";
  const password = process.env.FINIX_PASSWORD || "";
  const version = process.env.FINIX_VERSION || "2022-02-01";
  const merchantId = process.env.WGC_VALIDATION_MERCHANT_ID || "";
  const identityId = process.env.WGC_VALIDATION_IDENTITY_ID || "";
  const instrumentId = process.env.WGC_VALIDATION_INSTRUMENT_ID || "";

  // Refuse to run unless FINIX_ENVIRONMENT is explicitly "sandbox" — never
  // inferred, never defaulted. This is the single most important guard in
  // this script: it must be structurally impossible to point this at
  // production by omission.
  if (environment !== "sandbox") {
    fail('FINIX_ENVIRONMENT must be set to exactly "sandbox". Refusing to run against an unset or non-sandbox environment.');
  }

  if (!baseUrl.includes("sandbox")) {
    fail(`FINIX_BASE_URL ("${baseUrl}") does not look like a sandbox URL (must contain "sandbox"). Refusing to run.`);
  }
  if (baseUrl.includes("[SENSITIVE]") || username.includes("[SENSITIVE]") || password.includes("[SENSITIVE]")) {
    fail("Finix credentials are redacted in this environment — this script must be run locally by a human with real sandbox credentials, not inside an agent session.");
  }
  if (!username || !password) {
    fail("FINIX_USERNAME and FINIX_PASSWORD must both be set.");
  }
  if (!merchantId) {
    fail("WGC_VALIDATION_MERCHANT_ID must be set to an APPROVED sandbox WGC billing merchant id.");
  }
  if (!identityId) {
    fail("WGC_VALIDATION_IDENTITY_ID must be set to a sandbox buyer Identity id.");
  }
  if (!instrumentId) {
    fail("WGC_VALIDATION_INSTRUMENT_ID must be set to a sandbox Payment Instrument id.");
  }

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;

  // Confirm the configured merchant is actually approved before attempting
  // to subscribe it — never assume; ask Finix.
  console.log(`\nVerifying merchant ${merchantId} is APPROVED in Finix sandbox...`);
  const merchantRes = await fetch(`${baseUrl}/merchants/${merchantId}`, {
    headers: { Authorization: authHeader, Accept: "application/hal+json", "Finix-Version": version },
  });
  const merchantBody = await merchantRes.json().catch(() => ({}));
  if (!merchantRes.ok) {
    fail(`Could not fetch merchant ${merchantId}: ${merchantRes.status} ${JSON.stringify(redact(merchantBody))}`);
  }
  const merchantState = merchantBody?.onboarding_state ?? merchantBody?.status ?? "unknown";
  console.log(`Merchant state: ${merchantState}`);
  if (merchantState !== "APPROVED") {
    fail(`Merchant ${merchantId} is not APPROVED (state: ${merchantState}). Refusing to create a subscription against a non-approved merchant.`);
  }

  const idempotencyKey = `wgc-trial-validation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // The exact request shape currently implemented in
  // src/lib/billing/wgcSubscriptionService.ts — six-month trial, $1,000/mo
  // per the spec being validated. trial_details is the field under test:
  // this script exists specifically to confirm whether Finix accepts it as
  // named here, and if not, what it actually expects.
  const requestBody = {
    amount: 100000, // $1,000.00 in cents, per the spec being validated
    currency: "USD",
    billing_interval: "MONTHLY" as const,
    linked_to: merchantId,
    linked_type: "MERCHANT" as const,
    buyer_details: { identity_id: identityId, instrument_id: instrumentId },
    subscription_details: { collection_method: "BILL_AUTOMATICALLY" as const },
    trial_details: { trial_period_days: 180 }, // six months — field name/shape is exactly what's under test
    tags: { source: "wgc_trial_validation_script", idempotency_key: idempotencyKey },
  };

  console.log("\nProposed subscription request (no secrets, no card/bank details):");
  console.log(JSON.stringify(redact(requestBody), null, 2));
  console.log(`\nIdempotency key: ${idempotencyKey}`);
  console.log(`Target: ${baseUrl}/subscriptions (sandbox)`);

  const rl = readline.createInterface({ input: stdin, output: stdout });
  const answer = await rl.question('\nThis will create ONE real (sandbox) Finix subscription. Type "yes" to proceed, anything else to abort: ');
  rl.close();
  if (answer.trim().toLowerCase() !== "yes") {
    console.log("\nAborted — no subscription was created.");
    process.exit(0);
  }

  console.log("\nCreating sandbox subscription...");
  const subRes = await fetch(`${baseUrl}/subscriptions`, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      Accept: "application/json", // /subscriptions rejects hal+json with 406, per finix/client.ts
      "Content-Type": "application/json",
      "Finix-Version": version,
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(requestBody),
  });
  const subText = await subRes.text();
  let subBody: unknown;
  try {
    subBody = subText ? JSON.parse(subText) : {};
  } catch {
    subBody = subText;
  }

  console.log(`\nResponse status: ${subRes.status}`);
  console.log("Sanitized response body:");
  console.log(JSON.stringify(redact(subBody), null, 2));

  if (!subRes.ok) {
    console.log("\n--- REJECTED ---");
    console.log("Finix rejected this request. If the error names a specific field (e.g. an unrecognized `trial_details` key), that tells us the real field name/shape to use — check the error body above for a field-level message.");
    process.exit(1);
  }

  const body = subBody as Record<string, unknown>;
  const knownFieldNames = ["trial_start", "trial_end", "trial_ends_at", "first_charge_at", "next_charge_at", "state", "status", "id"];
  console.log("\n--- ACCEPTED ---");
  console.log("Fields Finix actually returned (cross-check against the list this script expected):");
  for (const key of Object.keys(body)) {
    const flag = knownFieldNames.includes(key) ? "expected" : "NEW — not previously mapped in wgcSubscriptionService.ts";
    console.log(`  ${key}: ${flag}`);
  }
  console.log("\nNext step: update src/lib/billing/wgcSubscriptionService.ts's response mapping, the webhook mapping in src/lib/billing/wgcSubscriptionWebhook.ts, and the corresponding tests to match the field names printed above exactly — do not guess.");
}

main().catch((err) => {
  console.error("\nUnexpected error (no secrets should be in this message, but double-check before pasting it anywhere):");
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
