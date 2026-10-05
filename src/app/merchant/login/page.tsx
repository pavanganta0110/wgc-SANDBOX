import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { resolveSafeMerchantRedirect } from "@/lib/safeReturnPath";
import MerchantLoginForm from "./MerchantLoginForm";

export default async function MerchantLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;

  // An already-authenticated merchant shouldn't see the login form again —
  // allowRestrictedAccess=true because a restricted (billing-gated)
  // merchant is still "already authenticated" and must be redirected
  // onward, never crash here. Previously called requireMerchantSession()
  // with no argument, which throws BillingAccessRestrictedError (not an
  // auth error, so not caught by isAuthError below) for exactly this
  // case — every already-logged-in restricted merchant who landed back
  // on /merchant/login crashed this page outright.
  try {
    await requireMerchantSession(true);
    redirect(resolveSafeMerchantRedirect(next));
  } catch (err) {
    if (!isAuthError(err)) throw err;
  }

  return (
    <Suspense>
      <MerchantLoginForm />
    </Suspense>
  );
}
