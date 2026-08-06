import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { setSessionCookie, getSession } from "@/lib/auth/session";
import { getOpaqueJourneyState, verifyIdToken, isValidRedirect } from "@/lib/auth/oauth";
import crypto from "crypto";
import { cookies } from "next/headers";
import { sendWgcEmail } from "@/lib/email";

// Helper to generate Apple client_secret JWT signed with ES256
function getAppleClientSecret(): string {
  const privateKey = process.env.APPLE_PRIVATE_KEY;
  const keyId = process.env.APPLE_KEY_ID;
  const teamId = process.env.APPLE_TEAM_ID;
  const clientId = process.env.APPLE_CLIENT_ID;

  if (!privateKey || !keyId || !teamId || !clientId) {
    throw new Error("Missing Apple credentials to sign client secret");
  }

  // Ensure key format has proper PEM headers and newlines
  const formattedKey = privateKey.replace(/\\n/g, "\n");

  const header = {
    alg: "ES256",
    kid: keyId,
  };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: teamId,
    iat: now,
    exp: now + 3600, // 1 hour
    aud: "https://appleid.apple.com",
    sub: clientId,
  };

  const headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signingInput = `${headerB64}.${payloadB64}`;

  const signer = crypto.createSign("sha256");
  signer.update(signingInput);
  const signature = signer.sign(formattedKey, "base64");
  
  // Convert standard DER signature returned by crypto.sign to IEEE P1363 (Raw) ES256 format
  // ES256 expects raw R and S coordinates of 32 bytes each.
  const signatureBuffer = Buffer.from(signature, "base64");
  const rawSignature = derToJose(signatureBuffer);

  return `${signingInput}.${rawSignature}`;
}

// Convert DER to JOSE (IEEE P1363) ES256 signature
function derToJose(der: Buffer): string {
  let offset = 0;
  if (der[offset] !== 0x30) throw new Error("Invalid signature format");
  offset += 2; // skip sequence tag and length

  if (der[offset] !== 0x02) throw new Error("Invalid signature format");
  const rLength = der[offset + 1];
  let rStart = offset + 2;
  if (der[rStart] === 0x00) {
    rStart++;
  }
  const r = der.subarray(rStart, offset + 2 + rLength);
  offset += 2 + rLength;

  if (der[offset] !== 0x02) throw new Error("Invalid signature format");
  const sLength = der[offset + 1];
  let sStart = offset + 2;
  if (der[sStart] === 0x00) {
    sStart++;
  }
  const s = der.subarray(sStart, offset + 2 + sLength);

  const pad = (buf: Buffer) => {
    if (buf.length >= 32) return buf.subarray(0, 32);
    const padded = Buffer.alloc(32);
    buf.copy(padded, 32 - buf.length);
    return padded;
  };

  return Buffer.concat([pad(r), pad(s)]).toString("base64url");
}

async function handleAppleAuth(
  code: string,
  idToken: string,
  stateToken: string,
  appleUserJson: string | null,
  req: Request
) {
  // Get state
  const journeyState = await getOpaqueJourneyState(stateToken);
  if (!journeyState) {
    const loginUrl = new URL("/merchant/login", req.url);
    loginUrl.searchParams.set("error", "The login session has expired or is invalid. Please try again.");
    return NextResponse.redirect(loginUrl.toString());
  }

  // Validate state nonce
  const cookieStore = await cookies();
  const nonceCookie = cookieStore.get(`apple_nonce_${stateToken}`)?.value;
  if (nonceCookie) {
    cookieStore.delete(`apple_nonce_${stateToken}`);
  }

  // Verify ID Token (JWKs verification)
  const verified = await verifyIdToken(idToken, "apple");
  const sub = verified.sub;
  const email = verified.email.toLowerCase().trim();

  // Exchange code at Apple's token endpoint to verify authenticity
  const clientId = process.env.APPLE_CLIENT_ID;
  const clientSecret = getAppleClientSecret();
  const host = req.headers.get("host") || "wgcpayments.com";
  const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  const redirectUri = `${protocol}://${host}/api/auth/callback/apple`;

  const tokenExchangeRes = await fetch("https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId || "",
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenExchangeRes.ok) {
    const errBody = await tokenExchangeRes.text();
    console.error("Apple code verification failed:", errBody);
    const loginUrl = new URL("/merchant/login", req.url);
    loginUrl.searchParams.set("error", "Failed to verify Apple authorization code.");
    return NextResponse.redirect(loginUrl.toString());
  }

  // Check if user is already logged in
  const session = await getSession();
  if (session) {
    if (journeyState.mode === "reauth") {
      const existingAccount = await prisma.authAccount.findUnique({
        where: { provider_providerAccountId: { provider: "apple", providerAccountId: sub } },
      });
      if (!existingAccount || existingAccount.userId !== session.userId) {
        const loginUrl = new URL("/merchant/login", req.url);
        loginUrl.searchParams.set("error", "Reauthentication failed. The Apple account does not match the logged-in user.");
        return NextResponse.redirect(loginUrl.toString());
      }
      await prisma.authAccount.update({
        where: { id: existingAccount.id },
        data: { lastLoginAt: new Date() },
      });
      await setSessionCookie({
        userId: session.userId,
        email: session.email,
        role: session.role,
        churchId: session.churchId,
        authVersion: session.authVersion,
        authTime: Math.floor(Date.now() / 1000),
      });
      let finalRedirect = "/merchant/dashboard";
      if (journeyState.redirectTo && isValidRedirect(journeyState.redirectTo)) {
        finalRedirect = journeyState.redirectTo;
      }
      return NextResponse.redirect(new URL(finalRedirect, req.url).toString());
    }

    // Connecting a provider
    const existingAccount = await prisma.authAccount.findUnique({
      where: { provider_providerAccountId: { provider: "apple", providerAccountId: sub } },
    });
    if (existingAccount) {
      if (existingAccount.userId !== session.userId) {
        const redirectUrl = new URL(journeyState.redirectTo || "/merchant/settings/security", req.url);
        redirectUrl.searchParams.set("error", "This Apple account is already connected to another user.");
        return NextResponse.redirect(redirectUrl.toString());
      }
      return NextResponse.redirect(new URL(journeyState.redirectTo || "/merchant/settings/security", req.url).toString());
    }

    await prisma.authAccount.create({
      data: {
        userId: session.userId,
        provider: "apple",
        providerAccountId: sub,
        providerEmail: email,
      },
    });

    if (session.churchId) {
      await prisma.dashboardAuditLog.create({
        data: {
          churchId: session.churchId,
          actorUserId: session.userId,
          actorEmail: session.email,
          actorRole: session.role,
          action: "auth.apple_connected",
          metadata: { provider: "apple", providerEmail: email },
          createdAt: new Date(),
        },
      });
    }
    return NextResponse.redirect(new URL(journeyState.redirectTo || "/merchant/settings/security", req.url).toString());
  }

  // Check if account already connected
  const existingAccount = await prisma.authAccount.findUnique({
    where: { provider_providerAccountId: { provider: "apple", providerAccountId: sub } },
    include: { user: true },
  });

  if (existingAccount) {
    const user = existingAccount.user;
    if (user.disabledAt) {
      const loginUrl = new URL("/merchant/login", req.url);
      loginUrl.searchParams.set("error", "This account has been disabled.");
      return NextResponse.redirect(loginUrl.toString());
    }

    await prisma.authAccount.update({
      where: { id: existingAccount.id },
      data: { lastLoginAt: new Date() },
    });
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await setSessionCookie({
      userId: user.id,
      email: user.email,
      role: user.role as any,
      churchId: user.churchId,
      authVersion: user.authVersion,
    });

    if (user.churchId) {
      await prisma.dashboardAuditLog.create({
        data: {
          churchId: user.churchId,
          actorUserId: user.id,
          actorEmail: user.email,
          actorRole: user.role,
          action: "auth.apple_login",
          createdAt: new Date(),
        },
      });
    }

    let finalRedirect = "/merchant/dashboard";
    if (journeyState.redirectTo && isValidRedirect(journeyState.redirectTo)) {
      finalRedirect = journeyState.redirectTo;
    }
    return NextResponse.redirect(new URL(finalRedirect, req.url).toString());
  }

  // Check if user already exists with this email
  const existingUser = await prisma.user.findUnique({ where: { email } });

  if (existingUser) {
    // Save details to secure cookie for account-linking page
    const linkPayload = {
      provider: "apple",
      providerAccountId: sub,
      providerEmail: email,
      email: existingUser.email,
    };
    
    const cookieStore = await cookies();
    cookieStore.set("wgc_pending_link", JSON.stringify(linkPayload), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });

    const loginUrl = new URL("/merchant/login", req.url);
    loginUrl.searchParams.set("linkNotice", "true");
    loginUrl.searchParams.set("provider", "Apple");
    return NextResponse.redirect(loginUrl.toString());
  }

  // Extract name if provided by Apple
  let userName: string | undefined = undefined;
  if (appleUserJson) {
    try {
      const parsedUser = JSON.parse(appleUserJson);
      if (parsedUser.name) {
        const first = parsedUser.name.firstName || "";
        const last = parsedUser.name.lastName || "";
        userName = `${first} ${last}`.trim() || undefined;
      }
    } catch (e) {
      console.error("Failed to parse Apple user JSON", e);
    }
  }

  // Handle signup and invitation acceptance
  if (journeyState.mode === "invite" && journeyState.inviteToken) {
    const tokenHash = crypto.createHash("sha256").update(journeyState.inviteToken).digest("hex");
    const invitedUser = await prisma.user.findFirst({
      where: { setPasswordTokenHash: tokenHash },
    });

    if (!invitedUser || !invitedUser.setPasswordTokenExpiresAt || invitedUser.setPasswordTokenExpiresAt < new Date()) {
      const loginUrl = new URL("/merchant/login", req.url);
      loginUrl.searchParams.set("error", "The invitation link has expired or is invalid.");
      return NextResponse.redirect(loginUrl.toString());
    }

    if (invitedUser.email.toLowerCase().trim() !== email) {
      // Require email ownership verification
      const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
      const cookieStore = await cookies();
      cookieStore.set(
        "wgc_invite_verify",
        JSON.stringify({
          code: verificationCode,
          invitedUserId: invitedUser.id,
          invitedEmail: invitedUser.email,
          provider: "apple",
          providerAccountId: sub,
          providerEmail: email,
        }),
        {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 600,
        }
      );

      await sendWgcEmail({
        to: invitedUser.email,
        subject: "Verify your email to accept WGC team invitation",
        title: "Verification Code",
        bodyHtml: `<p>You are trying to accept an invitation sent to <strong>${invitedUser.email}</strong> using Apple account <strong>${email}</strong>.</p>
                   <p>Please enter the following 6-digit code on the verification page to confirm ownership:</p>
                   <h2 style="font-size: 24px; font-weight: bold; letter-spacing: 2px;">${verificationCode}</h2>
                   <p>This code will expire in 10 minutes.</p>`,
      });

      const verifyUrl = new URL("/merchant/invite-verify", req.url);
      return NextResponse.redirect(verifyUrl.toString());
    }

    // Connect and accept invitation
    await prisma.user.update({
      where: { id: invitedUser.id },
      data: {
        setPasswordTokenHash: null,
        setPasswordTokenExpiresAt: null,
        lastLoginAt: new Date(),
        name: userName || invitedUser.name,
      },
    });

    await prisma.authAccount.create({
      data: {
        userId: invitedUser.id,
        provider: "apple",
        providerAccountId: sub,
        providerEmail: email,
        lastLoginAt: new Date(),
      },
    });

    if (invitedUser.invitedByUserId && invitedUser.churchId) {
      const { notifyEvent } = await import("@/lib/settings/notificationDispatch");
      await notifyEvent({
        churchId: invitedUser.churchId,
        eventKey: "TEAM_INVITE_ACCEPTED",
        subject: "Team invitation accepted",
        title: "Team Invitation Accepted",
        badgeText: "Team Update",
        badgeColor: "#0B5DBC",
        bodyHtml: `<p><strong>${invitedUser.email}</strong> has accepted their invitation via Apple.</p>`,
      });
    }

    await setSessionCookie({
      userId: invitedUser.id,
      email: invitedUser.email,
      role: invitedUser.role as any,
      churchId: invitedUser.churchId,
      authVersion: invitedUser.authVersion,
    });

    return NextResponse.redirect(new URL("/merchant/dashboard", req.url).toString());
  }

  if (journeyState.mode === "signup") {
    const newUser = await prisma.user.create({
      data: {
        email,
        role: "owner",
        name: userName,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    await prisma.authAccount.create({
      data: {
        userId: newUser.id,
        provider: "apple",
        providerAccountId: sub,
        providerEmail: email,
        lastLoginAt: new Date(),
      },
    });

    await setSessionCookie({
      userId: newUser.id,
      email: newUser.email,
      role: newUser.role as any,
      churchId: null,
      authVersion: newUser.authVersion,
    });

    let nextUrlStr = "/start";
    if (journeyState.promotion === "SIX_MONTHS_FREE") {
      const cookieStore = await cookies();
      cookieStore.set("wgc_promo_signup", "SIX_MONTHS_FREE", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 3600,
      });
      nextUrlStr = "/start";
    }

    return NextResponse.redirect(new URL(nextUrlStr, req.url).toString());
  }

  const loginUrl = new URL("/merchant/login", req.url);
  loginUrl.searchParams.set("error", "Unexpected signup state or mode.");
  return NextResponse.redirect(loginUrl.toString());
}

export async function POST(req: Request) {
  try {
    const bodyText = await req.text();
    const params = new URLSearchParams(bodyText);
    const code = params.get("code");
    const idToken = params.get("id_token");
    const stateToken = params.get("state");
    const appleUserJson = params.get("user"); // optional JSON name/email structure

    if (!code || !idToken || !stateToken) {
      const loginUrl = new URL("/merchant/login", req.url);
      loginUrl.searchParams.set("error", "Missing Apple authorization credentials.");
      return NextResponse.redirect(loginUrl.toString());
    }

    // Since SameSite=Lax prevents cookies from being sent on cross-site POST requests,
    // we return a client-side GET redirect so the browser sends the state cookie.
    const redirectUrl = new URL("/api/auth/callback/apple", req.url);
    redirectUrl.searchParams.set("code", code);
    redirectUrl.searchParams.set("id_token", idToken);
    redirectUrl.searchParams.set("state", stateToken);
    if (appleUserJson) {
      redirectUrl.searchParams.set("user", appleUserJson);
    }

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Redirecting...</title>
          <script>
            window.location.replace(${JSON.stringify(redirectUrl.toString())});
          </script>
        </head>
        <body>
          <p>Redirecting to authenticate your session...</p>
        </body>
      </html>
    `;

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html" },
    });
  } catch (err: any) {
    console.error("Apple POST callback failed:", err);
    const loginUrl = new URL("/merchant/login", req.url);
    loginUrl.searchParams.set("error", "An error occurred during Apple callback.");
    return NextResponse.redirect(loginUrl.toString());
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const idToken = searchParams.get("id_token");
    const stateToken = searchParams.get("state");
    const appleUserJson = searchParams.get("user");
    const errorParam = searchParams.get("error");

    if (errorParam === "user_cancelled_authorize") {
      const loginUrl = new URL("/merchant/login", req.url);
      loginUrl.searchParams.set("error", "Provider canceled authorization request.");
      return NextResponse.redirect(loginUrl.toString());
    }

    if (!code || !idToken || !stateToken) {
      const loginUrl = new URL("/merchant/login", req.url);
      loginUrl.searchParams.set("error", "Missing Apple parameters.");
      return NextResponse.redirect(loginUrl.toString());
    }

    return await handleAppleAuth(code, idToken, stateToken, appleUserJson, req);
  } catch (err: any) {
    console.error("Apple GET callback failed:", err);
    const loginUrl = new URL("/merchant/login", req.url);
    loginUrl.searchParams.set("error", "An error occurred during Apple callback.");
    return NextResponse.redirect(loginUrl.toString());
  }
}
