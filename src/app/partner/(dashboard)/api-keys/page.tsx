import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getPartnerSession } from "@/lib/partners/partnerSession";
import { ensureOnboardingCode } from "@/lib/partners/onboardingCode";
import PartnerApiKeysPanel from "@/components/partner/PartnerApiKeysPanel";

export const metadata = { title: "API Key | Partner dashboard" };
export const dynamic = "force-dynamic";

const REFERRAL_ENDPOINTS: [string, string][] = [
  ["GET /api/v1/partner/organizations", "Every organization you brought in, with the agent who brought it, its status and the date. Filter with ?agent=<agent id> (or agent=none)."],
  ["GET /api/v1/partner/onboarding", "Where each application stands (submitted, under_review, information_required, approved, rejected), with the agent. Filter with ?agent=."],
  ["POST /api/v1/partner/agents", "Add an agent: body { \"name\": \"...\", \"email\": \"...\" (optional) }. Returns the agent and their Get Started link. WGC sets the agent's rate."],
  ["GET /api/v1/partner/agents", "Your agents, how many organizations each brought in, and each agent's Get Started link."],
];

export default async function PartnerApiKeysPage() {
  const session = await getPartnerSession();
  if (!session) redirect("/partner/login");
  const referral = session.partnerType === "REFERRAL";

  let agentLinks: { id: string; name: string; url: string }[] = [];
  let base = "";
  if (referral) {
    const h = await headers();
    base = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? ""}`;
    const code = await ensureOnboardingCode(session.partnerId);
    const agents = await prisma.partnerAgent.findMany({ where: { partnerId: session.partnerId, status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true } });
    agentLinks = agents.map((a) => ({ id: a.id, name: a.name, url: `${base}/start?partner=${code}&agent=${a.id}` }));
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">API Key</h2>
        <p className="text-sm text-slate-500 mt-1">
          {referral
            ? "One key lets your own systems pull the organizations you brought in and which agent brought each, and add agents."
            : "One read-only key gives you the gifts and organizations of everyone linked to your account, for your own reporting."}
        </p>
      </div>
      <PartnerApiKeysPanel />
      {referral && (
        <>
          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-2">
            <h3 className="text-sm font-bold text-slate-900">What you can read</h3>
            <p className="text-xs text-slate-500">Send the key as <code>Authorization: Bearer wgc_ptr_…</code> to {base || "this site"}. Donor and gift data are not part of a referral key.</p>
            <ul className="divide-y divide-slate-100 text-sm">
              {REFERRAL_ENDPOINTS.map(([e, d]) => (
                <li key={e} className="py-2"><code className="text-xs font-semibold">{e}</code><div className="text-slate-600">{d}</div></li>
              ))}
            </ul>
          </section>
          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-2">
            <h3 className="text-sm font-bold text-slate-900">Get Started link for each agent</h3>
            <p className="text-xs text-slate-500">An organization that applies through an agent&apos;s link is credited to that agent, so you see who brought it in. Add <code>&amp;ref=</code> for your own id, or <code>org</code>, <code>name</code>, <code>email</code>, <code>phone</code>, <code>website</code> to prefill.</p>
            {agentLinks.length === 0 ? (
              <p className="text-sm text-slate-500">No agents yet. WGC adds them for you.</p>
            ) : (
              <ul className="space-y-2">
                {agentLinks.map((a) => (
                  <li key={a.id}><div className="text-sm font-semibold text-slate-900">{a.name}</div><code className="block break-all rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs">{a.url}</code></li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
