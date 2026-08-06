import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { setSessionCookie, getSession, type SessionPayload } from "@/lib/auth/session";
import { getOpaqueJourneyState, verifyIdToken, isValidRedirect } from "@/lib/auth/oauth";
import crypto from "crypto";
import { cookies } from "next/headers";
import { sendWgcEmail } from "@/lib/email";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const stateToken = searchParams.get("state");
    const errorParam = searchParams.get("error");

    if (errorParam === "access_denied") {
      const loginUrl = new URL("/merchant/login", req.url);
      loginUrl.searchParams.set("error", "Provider canceled authorization request.");
      return NextResponse.redirect(loginUrl.toString());
    }

    if (!code || !stateToken) {
      const loginUrl = new URL("/merchant/login", req.url);
      loginUrl.searchParams.set("error", "Authentication failed due to missing authorization parameters.");
      return NextResponse.redirect(loginUrl.toString());
    }

    // Get and consume state
    const journeyState = await getOpaqueJourneyState(stateToken);
    if (!journeyState) {
      const loginUrl = new URL("/merchant/login", req.url);
      loginUrl.searchParams.set("error", "The login session has expired or is invalid. Please try again.");
      return NextResponse.redirect(loginUrl.toString());
    }

    // Exchange code for tokens
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const host = req.headers.get("host") || "wgcpayments.com";
    const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
    const redirectUri = `${protocol}://${host}/api/auth/callback/google`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId || "",
        client_secret: clientSecret || "",
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error("Google token exchange failed:", errBody);
      const loginUrl = new URL("/merchant/login", req.url);
      loginUrl.searchParams.set("error", "Failed to exchange Google authorization code.");
      return NextResponse.redirect(loginUrl.toString());
    }

    const tokenData = await tokenRes.json();
    const idToken = tokenData.id_token;
    if (!idToken) {
      const loginUrl = new URL("/merchant/login", req.url);
      loginUrl.searchParams.set("error", "Google did not return an ID token.");
      return NextResponse.redirect(loginUrl.toString());
    }

    // Verify ID Token
    const verified = await verifyIdToken(idToken, "google");
    const sub = verified.sub;
    const email = verified.email.toLowerCase().trim();
    const name = verified.name;

    // Check if user is already logged in
    const session = await getSession();
    if (session) {
      if (journeyState.mode === "reauth") {
        const existingAccount = await prisma.authAccount.findUnique({
          where: { provider_providerAccountId: { provider: "google", providerAccountId: sub } },
        });
        if (!existingAccount || existingAccount.userId !== session.userId) {
          const loginUrl = new URL("/merchant/login", req.url);
          loginUrl.searchParams.set("error", "Reauthentication failed. The Google account does not match the logged-in user.");
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
        where: { provider_providerAccountId: { provider: "google", providerAccountId: sub } },
      });
      if (existingAccount) {
        if (existingAccount.userId !== session.userId) {
          const redirectUrl = new URL(journeyState.redirectTo || "/merchant/settings/security", req.url);
          redirectUrl.searchParams.set("error", "This Google account is already connected to another user.");
          return NextResponse.redirect(redirectUrl.toString());
        }
        return NextResponse.redirect(new URL(journeyState.redirectTo || "/merchant/settings/security", req.url).toString());
      }

      await prisma.authAccount.create({
        data: {
          userId: session.userId,
          provider: "google",
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
            action: "auth.google_connected",
            metadata: { provider: "google", providerEmail: email },
            createdAt: new Date(),
          },
        });
      }
      return NextResponse.redirect(new URL(journeyState.redirectTo || "/merchant/settings/security", req.url).toString());
    }

    // Check if external account is already connected
    const existingAccount = await prisma.authAccount.findUnique({
      where: { provider_providerAccountId: { provider: "google", providerAccountId: sub } },
      include: { user: true },
    });

    if (existingAccount) {
      const user = existingAccount.user;
      if (user.disabledAt) {
        const loginUrl = new URL("/merchant/login", req.url);
        loginUrl.searchParams.set("error", "This account has been disabled.");
        return NextResponse.redirect(loginUrl.toString());
      }

      // Update lastLoginAt
      await prisma.authAccount.update({
        where: { id: existingAccount.id },
        data: { lastLoginAt: new Date() },
      });
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      // Issue session
      await setSessionCookie({
        userId: user.id,
        email: user.email,
        role: user.role as any,
        churchId: user.churchId,
        authVersion: user.authVersion,
      });

      // Log login event
      if (user.churchId) {
        await prisma.dashboardAuditLog.create({
          data: {
            churchId: user.churchId,
            actorUserId: user.id,
            actorEmail: user.email,
            actorRole: user.role,
            action: "auth.google_login",
            createdAt: new Date(),
          },
        });
      }

      // Preserve return destination
      let finalRedirect = "/merchant/dashboard";
      if (journeyState.redirectTo && isValidRedirect(journeyState.redirectTo)) {
        finalRedirect = journeyState.redirectTo;
      }
      return NextResponse.redirect(new URL(finalRedirect, req.url).toString());
    }

    // Checking if there is an existing WGC user with this email
    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (existingUser) {
      // Prevent silent merges
      // Save details to secure cookie for account-linking page
      const linkPayload = {
        provider: "google",
        providerAccountId: sub,
        providerEmail: email,
        email: existingUser.email,
      };
      
      const cipherText = crypto.createHash("sha256").update(JSON.stringify(linkPayload)).digest("hex");
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
      loginUrl.searchParams.set("provider", "Google");
      return NextResponse.redirect(loginUrl.toString());
    }

    // Handles signup and invitation acceptance for new users
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
        // Mismatch — require verification of the invited email
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        const cookieStore = await cookies();
        cookieStore.set(
          "wgc_invite_verify",
          JSON.stringify({
            code: verificationCode,
            invitedUserId: invitedUser.id,
            invitedEmail: invitedUser.email,
            provider: "google",
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

        // Send code email
        await sendWgcEmail({
          to: invitedUser.email,
          subject: "Verify your email to accept WGC team invitation",
          title: "Verification Code",
          bodyHtml: `<p>You are trying to accept an invitation sent to <strong>${invitedUser.email}</strong> using Google account <strong>${email}</strong>.</p>
                     <p>Please enter the following 6-digit code on the verification page to confirm ownership:</p>
                     <h2 style="font-size: 24px; font-weight: bold; letter-spacing: 2px;">${verificationCode}</h2>
                     <p>This code will expire in 10 minutes.</p>`,
        });

        const verifyUrl = new URL("/merchant/invite-verify", req.url);
        return NextResponse.redirect(verifyUrl.toString());
      }

      // Correct email — link and accept invitation immediately
      await prisma.user.update({
        where: { id: invitedUser.id },
        data: {
          setPasswordTokenHash: null,
          setPasswordTokenExpiresAt: null,
          lastLoginAt: new Date(),
        },
      });

      await prisma.authAccount.create({
        data: {
          userId: invitedUser.id,
          provider: "google",
          providerAccountId: sub,
          providerEmail: email,
          lastLoginAt: new Date(),
        },
      });

      // Send dispatch notification
      if (invitedUser.invitedByUserId && invitedUser.churchId) {
        const { notifyEvent } = await import("@/lib/settings/notificationDispatch");
        await notifyEvent({
          churchId: invitedUser.churchId,
          eventKey: "TEAM_INVITE_ACCEPTED",
          subject: "Team invitation accepted",
          title: "Team Invitation Accepted",
          badgeText: "Team Update",
          badgeColor: "#0B5DBC",
          bodyHtml: `<p><strong>${invitedUser.email}</strong> has accepted their invitation via Google.</p>`,
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
      // Normal social signup
      const newUser = await prisma.user.create({
        data: {
          email,
          role: "owner", // Primary signup role is owner
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      await prisma.authAccount.create({
        data: {
          userId: newUser.id,
          provider: "google",
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
        // Save promotion attribution to session cookie or state
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

    // Default fallback
    const loginUrl = new URL("/merchant/login", req.url);
    loginUrl.searchParams.set("error", "Unexpected signup state or mode.");
    return NextResponse.redirect(loginUrl.toString());
  } catch (err: any) {
    console.error("Google OAuth callback failed:", err);
    const loginUrl = new URL("/merchant/login", req.url);
    loginUrl.searchParams.set("error", "An internal error occurred during Google sign in.");
    return NextResponse.redirect(loginUrl.toString());
  }
}
