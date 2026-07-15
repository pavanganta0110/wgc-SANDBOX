import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
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
        
      headers["finix-signature"] = `t=${timestamp},v1=${signature}`;
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
