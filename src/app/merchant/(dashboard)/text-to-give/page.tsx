import { redirect } from "next/navigation";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { hasPermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import TextToGiveSettingsPanel from "@/components/merchant/TextToGiveSettingsPanel";

export default async function TextToGivePage() {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/login");
    throw err;
  }
  if (!hasPermission(auth, "canEditFundraisingCampaign")) redirect("/merchant/dashboard");

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-medium">Text to Give</h2>
        <p className="mt-1 text-sm text-gray-500">A donor texts a keyword and gets back a link to give — set up your keywords ahead of launch.</p>
      </div>
      <TextToGiveSettingsPanel />
    </div>
  );
}
