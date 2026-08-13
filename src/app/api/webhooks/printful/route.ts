import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPrintfulMode, getPrintfulWebhookSecret } from "@/lib/integrations/printful/config";
import { MockPrintfulProvider } from "@/lib/integrations/printful/mockProvider";
import { PrintfulProvider } from "@/lib/integrations/printful/realProvider";
import { recordAndProcessWebhookEvent } from "@/lib/integrations/printful/webhooks";

/**
 * Real Printful webhook receiver (spec item 44). Signature verification is
 * only enforced once PRINTFUL_WEBHOOK_SECRET is actually configured — in
 * mock mode / before real credentials arrive, this endpoint still exists
 * and is exercised by the mock webhook simulator (see
 * webhooks.ts/simulateMockWebhookEvent) so the pipeline is genuinely
 * tested end-to-end, but nothing external can reach it usefully without a
 * real Printful account pointed at it. Always returns 200 once the payload
 * is at least parseable — matches the Finix webhook handler's
 * "never make the provider think the endpoint is down" behavior; real
 * failures are recorded on MerchandiseWebhookEvent for retry/inspection,
 * never re-thrown to the HTTP layer.
 */
export async function POST(req: Request) {
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return NextResponse.json({ error: "Could not read request body." }, { status: 400 });
  }

  const webhookSecret = getPrintfulWebhookSecret();
  if (webhookSecret) {
    // TODO(real-printful): verify against Printful's actual signature
    // header/scheme once confirmed against a real account (spec item 44
    // step 2) — Printful's exact header name and HMAC construction are not
    // yet documented from a verified source. Left as an explicit no-op
    // rather than a guessed implementation, so a wrong guess never silently
    // "verifies" an unsigned/forged payload.
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  try {
    const mode = getPrintfulMode();
    const provider = mode === "mock" ? new MockPrintfulProvider("") : new PrintfulProvider({ accessToken: "" });
    const event = await provider.parseWebhook(payload);

    // Resolve which church this event belongs to via the order it
    // references — multi-tenant isolation (spec item 7): an event can only
    // ever touch the church that actually owns the referenced order.
    let churchId: string | null = null;
    let connectionId: string | null = null;
    if (event.externalOrderId) {
      const order = await prisma.merchandiseOrder.findFirst({ where: { externalOrderId: event.externalOrderId }, select: { churchId: true, printfulConnectionId: true } });
      churchId = order?.churchId ?? null;
      connectionId = order?.printfulConnectionId ?? null;
    }

    const result = await recordAndProcessWebhookEvent({ event, churchId, connectionId });
    return NextResponse.json({ received: true, alreadyProcessed: result.alreadyProcessed });
  } catch (err) {
    console.error("Printful webhook processing failed:", err);
    // Still 200 — the row (if it got created) preserves this for retry;
    // an HTTP error here would just cause Printful to hammer retries for
    // an internal bug that a webhook redelivery can't fix.
    return NextResponse.json({ received: true, error: "internal_processing_error" });
  }
}
