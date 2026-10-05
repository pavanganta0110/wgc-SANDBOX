"use client";

import { useSearchParams } from "next/navigation";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import AuthOptions from "@/components/auth/AuthOptions";
import { resolveSafeMerchantRedirect } from "@/lib/safeReturnPath";

/**
 * Renders AuthOptions (email/password + Google + Apple sign-in) — this
 * form was accidentally reverted to a plain email/password-only version
 * on 2026-08-06 (commit 1257db9): that fix was built from a copy of this
 * file that predated the Google/Apple social-login feature (commit
 * efb1c04, same day, earlier), so applying it silently discarded the
 * AuthOptions integration instead of merging with it. Restored here
 * 2026-08-15 — see AuthOptions.tsx for the actual login UI/logic (kept
 * unmodified) and oauth.ts for the Google/Apple callback flow.
 */
export default function MerchantLoginForm() {
  const searchParams = useSearchParams();
  const isReauth = searchParams.get("reauth") === "true";

  // AuthOptions' own convention is `?redirectTo=` (used by the reauth
  // links in SecuritySettingsForm.tsx) — but /activate-subscription/[token]
  // sends restricted/unauthenticated merchants here with `?next=` instead
  // (a second, independently-added convention). Accept either, always
  // through resolveSafeMerchantRedirect's same-origin validation, so
  // neither redirect path silently drops back to /merchant/dashboard.
  const redirectTo = resolveSafeMerchantRedirect(searchParams.get("redirectTo") || searchParams.get("next"));

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow max-w-md w-full mx-auto py-24 px-6">
        <AuthOptions
          mode={isReauth ? "reauth" : "login"}
          heading={isReauth ? "Verify your identity" : "Merchant Dashboard Login"}
          subheading={isReauth ? "Please authenticate using any login method connected to your account." : "Log in to your WGC Payments dashboard."}
          redirectTo={redirectTo}
          reauthType={searchParams.get("reauthType") || undefined}
        />
      </main>
      <Footer />
    </div>
  );
}
