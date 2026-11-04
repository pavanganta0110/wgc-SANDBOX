import { redirect } from "next/navigation";
import { getPartnerSession } from "@/lib/partners/partnerSession";

/** For the software partner's own pages (organizations, API key, webhook, menu, billing, docs). Others go to their home. */
export async function requireSoftwarePartner() {
  const session = await getPartnerSession();
  if (!session) redirect("/partner/login");
  if (session.partnerType === "REFERRAL") redirect("/partner/volume");
  return session;
}
