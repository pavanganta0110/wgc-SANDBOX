import { redirect } from "next/navigation";
import { getPartnerSession } from "@/lib/partners/partnerSession";

export default async function PartnerIndexPage() {
  const session = await getPartnerSession({ allowAgent: true });
  if (session?.agentId) redirect("/partner/commissions");
  redirect(session?.partnerType === "REFERRAL" ? "/partner/volume" : "/partner/organizations");
}
