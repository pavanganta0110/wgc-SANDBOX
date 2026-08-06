import { NextResponse } from "next/server";
import crypto from "crypto";
import { setOpaqueJourneyState, type JourneyState } from "@/lib/auth/oauth";

export async function GET(req: Request) {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      return NextResponse.json({ error: "Google provider is not configured correctly in this environment." }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const mode = (searchParams.get("mode") || "login") as JourneyState["mode"];
    const redirectTo = searchParams.get("redirectTo") || undefined;
    const promotion = searchParams.get("promotion") || undefined;
    const inviteToken = searchParams.get("inviteToken") || undefined;
    const activationToken = searchParams.get("activationToken") || undefined;
    const reauthType = searchParams.get("reauthType") || undefined;

    // Generate opaque state
    const stateToken = crypto.randomBytes(16).toString("hex");
    
    await setOpaqueJourneyState(stateToken, {
      mode,
      redirectTo,
      promotion,
      inviteToken,
      activationToken,
      reauthType,
    });

    const host = req.headers.get("host") || "wgcpayments.com";
    const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
    const redirectUri = `${protocol}://${host}/api/auth/callback/google`;

    const googleAuthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    googleAuthUrl.searchParams.set("client_id", clientId);
    googleAuthUrl.searchParams.set("redirect_uri", redirectUri);
    googleAuthUrl.searchParams.set("response_type", "code");
    googleAuthUrl.searchParams.set("scope", "openid email profile");
    googleAuthUrl.searchParams.set("state", stateToken);
    googleAuthUrl.searchParams.set("prompt", "select_account");

    return NextResponse.redirect(googleAuthUrl.toString());
  } catch (err: any) {
    console.error("Google auth initiation failed:", err);
    return NextResponse.json({ error: "Failed to initiate Google sign in." }, { status: 500 });
  }
}
