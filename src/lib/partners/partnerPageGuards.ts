import { redirect } from "next/navigation";
import { getPartnerSession } from "@/lib/partners/partnerSession";

/**
 * For the software partner's own pages (organizations, API key, webhook, menu, billing, docs). A referral partner goes
 * to its own home. A view-only team member is let in only where the page says so (the organizations list).
 */
export async function requireSoftwarePartner(options: { allowViewer?: boolean } = {}) {
  const session = await getPartnerSession({ allowViewer: options.allowViewer });
  if (!session) redirect("/partner/login");
  if (session.partnerType === "REFERRAL") redirect("/partner/volume");
  return session;
}
