import { NextResponse } from "next/server";
import crypto from "crypto";
import { cookies } from "next/headers";
import { setOpaqueJourneyState, type JourneyState } from "@/lib/auth/oauth";

export async function GET(req: Request) {
  try {
    const clientId = process.env.APPLE_CLIENT_ID;
    const teamId = process.env.APPLE_TEAM_ID;
    const keyId = process.env.APPLE_KEY_ID;
    const privateKey = process.env.APPLE_PRIVATE_KEY;

    if (!clientId || !teamId || !keyId || !privateKey) {
      return NextResponse.json({ error: "Apple provider is not configured correctly in this environment." }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const mode = (searchParams.get("mode") || "login") as JourneyState["mode"];
    const redirectTo = searchParams.get("redirectTo") || undefined;
    const promotion = searchParams.get("promotion") || undefined;
    const inviteToken = searchParams.get("inviteToken") || undefined;
    const activationToken = searchParams.get("activationToken") || undefined;
    const reauthType = searchParams.get("reauthType") || undefined;

    const stateToken = crypto.randomBytes(16).toString("hex");
    const nonce = crypto.randomBytes(16).toString("hex");

    await setOpaqueJourneyState(stateToken, {
      mode,
      redirectTo,
      promotion,
      inviteToken,
      activationToken,
      reauthType,
    });

    const cookieStore = await cookies();
    cookieStore.set(`apple_nonce_${stateToken}`, nonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });

    const host = req.headers.get("host") || "wgcpayments.com";
    const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
    const redirectUri = `${protocol}://${host}/api/auth/callback/apple`;

    const appleAuthUrl = new URL("https://appleid.apple.com/auth/authorize");
    appleAuthUrl.searchParams.set("client_id", clientId);
    appleAuthUrl.searchParams.set("redirect_uri", redirectUri);
    appleAuthUrl.searchParams.set("response_type", "code id_token");
    appleAuthUrl.searchParams.set("response_mode", "form_post");
    appleAuthUrl.searchParams.set("scope", "name email");
    appleAuthUrl.searchParams.set("state", stateToken);
    appleAuthUrl.searchParams.set("nonce", nonce);

    return NextResponse.redirect(appleAuthUrl.toString());
  } catch (err: any) {
    console.error("Apple auth initiation failed:", err);
    return NextResponse.json({ error: "Failed to initiate Apple sign in." }, { status: 500 });
  }
}
