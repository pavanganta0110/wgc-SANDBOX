import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";

export async function POST(req: Request) {
  try {
    const { recaptchaToken } = await req.json();

    if (!recaptchaToken) {
      return NextResponse.json({ error: "Missing reCAPTCHA token" }, { status: 400 });
    }

    const recaptchaSecret = process.env.RECAPTCHA_SECRET_KEY;
    if (recaptchaSecret) {
      const verifyRes = await fetch("https://www.google.com/recaptcha/api/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `secret=${recaptchaSecret}&response=${recaptchaToken}`,
      });
      const verifyJson = await verifyRes.json();
      if (!verifyJson.success) {
        return NextResponse.json({ error: "Failed reCAPTCHA validation. Please try again." }, { status: 400 });
      }

      // If successful, create a signed cookie indicating they solved the captcha.
      const timestamp = Date.now().toString();
      const payload = `verified=true&ts=${timestamp}`;
      const signature = crypto.createHmac('sha256', recaptchaSecret).update(payload).digest('hex');
      const cookieValue = `${payload}&sig=${signature}`;

      // Set cookie (valid for 2 hours during onboarding session)
      const cookieStore = await cookies();
      cookieStore.set('wgc_onboarding_captcha', cookieValue, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7200, // 2 hours
        path: '/'
      });
    } else {
      // If no secret key is set (e.g. dev environment), we can still set a dummy cookie
      const cookieStore = await cookies();
      cookieStore.set('wgc_onboarding_captcha', 'bypass=true', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7200,
        path: '/'
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("CAPTCHA_VERIFY_ERROR", err.message);
    return NextResponse.json({ error: "An unexpected error occurred verifying CAPTCHA." }, { status: 500 });
  }
}
