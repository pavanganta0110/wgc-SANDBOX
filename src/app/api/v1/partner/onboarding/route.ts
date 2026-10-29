import { apiSuccess } from "@/lib/api/response";
import { withPartnerApiAuth } from "@/lib/partners/partnerApiAuth";
import { loadPartnerOnboarding } from "@/lib/partners/loadPartnerOnboarding";

/**
 * The partner's onboarding applications and the stage each is in: submitted,
 * under_review, information_required (with what is missing), approved or rejected.
 * The same stages are pushed by the onboarding.* webhook events. Upload links are
 * not returned here; they arrive in the onboarding.information_required webhook
 * event, or can be reissued from the partner dashboard.
 */
export const GET = withPartnerApiAuth(async (_req, auth, requestId) => {
  const rows = await loadPartnerOnboarding(auth.partnerId);
  return apiSuccess(rows, requestId, { count: rows.length });
});
