import { redirect } from "next/navigation";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import MerchantLoginForm from "./MerchantLoginForm";

export default async function MerchantLoginPage() {
  // An already-authenticated merchant shouldn't see the login form again.
  try {
    await requireMerchantSession();
    redirect("/merchant/dashboard");
  } catch (err) {
    if (!isAuthError(err)) throw err;
  }

  return <MerchantLoginForm />;
}
