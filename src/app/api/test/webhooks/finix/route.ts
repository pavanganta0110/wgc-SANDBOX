import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    // Production safety gate — this route exists purely to help test
    // /api/webhooks/finix's own logic by relaying a request to it (with an
    // optionally-generated signature). middleware.ts always lets /api/test/*
    // through and its own comment claims "TEST_WEBHOOK_SECRET, checked by
    // the route itself" — but until now nothing here ever actually checked
    // it, leaving this fully unauthenticated in production. Confirmed via
    // security review: it was only ever non-exploitable by accident (the
    // signature this route generated used the wrong header key names, so
    // the real verifier below always rejected it) — fixing that formatting
    // bug without this gate would have turned it into a live webhook-
    // forgery oracle. Local dev (no TEST_WEBHOOK_SECRET set, non-production)
    // keeps working exactly as before.
    if (process.env.NODE_ENV === "production") {
      const configuredSecret = process.env.TEST_WEBHOOK_SECRET;
      const providedSecret = req.headers.get("x-test-webhook-secret");
      if (!configuredSecret || providedSecret !== configuredSecret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const rawBody = await req.text();
    
    // Fire the request to the real webhook endpoint internally to test it
    const domain = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    
    // In a real environment, you'd generate the Finix signature based on WEBHOOK_SECRET
    // Since this is just a proxy/tester, we assume the caller provides valid headers if they want to test signature validation.
    // However, if the middleware passed us, we can mock a valid signature if we know the secret for local testing.
    
    // For local dev convenience, we'll sign it if a test query param is passed
    const url = new URL(req.url);
    const shouldSign = url.searchParams.get("sign") === "true";
    
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    
    const auth = req.headers.get("authorization");
    if (auth) headers["Authorization"] = auth;
    
    if (shouldSign && process.env.FINIX_WEBHOOK_SIGNING_KEY) {
      const crypto = require("crypto");
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const payloadToSign = `${timestamp}:${rawBody}`;
      const signature = crypto
        .createHmac("sha256", process.env.FINIX_WEBHOOK_SIGNING_KEY)
        .update(payloadToSign, "utf-8")
        .digest("hex");
        
      // Must match the real verifier's expected key names exactly (see
      // /api/webhooks/finix's own parsing: "timestamp"/"sig", not "t"/"v1")
      // — this was previously the accidental reason a forged signature here
      // always failed verification. Now that the production gate above is
      // in place, a correctly-shaped signature is what makes this tool
      // actually useful for its intended purpose again.
      headers["finix-signature"] = `timestamp=${timestamp},sig=${signature}`;
    } else {
      const sig = req.headers.get("finix-signature");
      if (sig) headers["finix-signature"] = sig;
    }
    
    const response = await fetch(`${domain}/api/webhooks/finix`, {
      method: "POST",
      headers,
      body: rawBody
    });
    
    const data = await response.json().catch(() => null);
    
    return NextResponse.json({
      status: response.status,
      response: data
    });
    
  } catch (error) {
    console.error("Test webhook error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
