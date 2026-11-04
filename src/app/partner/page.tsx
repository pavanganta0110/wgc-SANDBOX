import { redirect } from "next/navigation";
import { getPartnerSession } from "@/lib/partners/partnerSession";

export default async function PartnerIndexPage() {
  const session = await getPartnerSession({ allowAgent: true });
  redirect(session?.agentId ? "/partner/commissions" : "/partner/organizations");
}
