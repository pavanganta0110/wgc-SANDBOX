import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";

/**
 * Best-effort read of the current request's merchant session, used only to
 * let a campaign's own org staff preview it before it's published (see
 * loadPublicCampaignData.ts's previewChurchId). Never throws — a real
 * public visitor has no session cookie at all, which is the expected,
 * common case here, not an error. allowRestrictedAccess: true so a church
 * whose WGC billing is past due can still preview their own campaign —
 * this is a read-only page, not a restricted dashboard action.
 */
export async function getPreviewChurchId(): Promise<string | undefined> {
  try {
    const auth = await requireMerchantSession(true);
    return auth.churchId;
  } catch {
    return undefined;
  }
}
