import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { CheckCircle, Clock, FileWarning, XCircle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import StartOnboardingForm from "@/app/start/StartOnboardingForm";
import AutoRefresh from "./AutoRefresh";
import { verifyPartnerEmbedLinkToken } from "@/lib/partners/embedLink";
import { ensureOnboardingCode } from "@/lib/partners/onboardingCode";
import { loadPartnerEmbedState } from "@/lib/partners/loadEmbedState";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function Panel({ icon, tone, title, children }: { icon: ReactNode; tone: string; title: string; children: ReactNode }) {
  return (
    <main className="max-w-xl w-full mx-auto px-6 py-16 flex flex-col items-center text-center">
      <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-6 ${tone}`}>{icon}</div>
      <h1 className="text-2xl font-bold text-slate-900 mb-3">{title}</h1>
      <div className="text-slate-600 space-y-3">{children}</div>
    </main>
  );
}

/**
 * The one page a partner shows in its frame for an organization. It follows the organization:
 * the application form, "submitted", what more WGC needs, "approved, setting up" and finally
 * the organization's dashboard. Needs a signed link from POST /api/v1/partner/embed-links;
 * without a valid one it shows nothing about anyone.
 */
export default async function PartnerEmbedPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const link = typeof params.link === "string" ? params.link : "";
  const payload = verifyPartnerEmbedLinkToken(link);

  if (!payload) {
    return (
      <Panel icon={<Clock className="w-8 h-8" />} tone="bg-slate-100 text-slate-600" title="This page has expired">
        <p>Close it and open it again from where you came.</p>
      </Panel>
    );
  }

  const partner = await prisma.partner.findUnique({ where: { id: payload.partnerId }, select: { status: true } });
  if (!partner || partner.status !== "ACTIVE") {
    return (
      <Panel icon={<XCircle className="w-8 h-8" />} tone="bg-red-50 text-red-600" title="Not available">
        <p>This page is not available right now.</p>
      </Panel>
    );
  }

  const state = await loadPartnerEmbedState(payload.partnerId, payload.reference);
  const here = `/partner-embed?link=${encodeURIComponent(link)}`;

  switch (state.kind) {
    case "form":
      return (
        <StartOnboardingForm
          embed
          partnerCode={await ensureOnboardingCode(payload.partnerId)}
          partnerReference={payload.reference}
          prefill={payload.prefill}
          afterSubmitPath={here}
        />
      );

    case "pending":
      return (
        <Panel icon={<CheckCircle className="w-8 h-8" />} tone="bg-green-50 text-green-600" title={state.stage === "submitted" ? "Application submitted" : "Application under review"}>
          <p>Thank you. {state.organizationName} is being reviewed. Reviews are completed within 48 hours, often quicker.</p>
          <p>This page updates by itself when there is news. You can close it and come back.</p>
          <AutoRefresh />
        </Panel>
      );

    case "information_required":
      return (
        <Panel icon={<FileWarning className="w-8 h-8" />} tone="bg-amber-50 text-amber-600" title="More information needed">
          <p>To finish reviewing {state.organizationName}, we need the following:</p>
          {state.items.length > 0 && (
            <ul className="text-left list-disc pl-6 space-y-1">
              {state.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
          <a
            href={`/partner-embed/update?link=${encodeURIComponent(link)}`}
            className="inline-block mt-4 metallic-gold px-8 py-3 text-sm font-bold rounded-xl shadow-lg text-slate-900"
          >
            Add the information
          </a>
          <AutoRefresh />
        </Panel>
      );

    case "setting_up":
      return (
        <Panel icon={<CheckCircle className="w-8 h-8" />} tone="bg-green-50 text-green-600" title="Approved">
          <p>{state.organizationName} is approved. We are setting up your account. This takes a moment.</p>
          <AutoRefresh seconds={10} />
        </Panel>
      );

    case "rejected":
      return (
        <Panel icon={<XCircle className="w-8 h-8" />} tone="bg-red-50 text-red-600" title="Application not approved">
          <p>We could not approve {state.organizationName}. Please contact support to talk about next steps.</p>
        </Panel>
      );

    case "failed":
      return (
        <Panel icon={<XCircle className="w-8 h-8" />} tone="bg-red-50 text-red-600" title="Application could not be completed">
          <p>Something went wrong while setting up {state.organizationName}. Please contact support.</p>
        </Panel>
      );

    case "ready":
      // Opening the dashboard starts the session, which a page can't do, so a route does and comes back here if it can't.
      if (params.problem !== "1") redirect(`/partner-embed/enter?link=${encodeURIComponent(link)}`);
      return (
        <Panel icon={<XCircle className="w-8 h-8" />} tone="bg-amber-50 text-amber-600" title="You don't have access yet">
          <p>Your organization is set up, but your email has not been added. Ask your organization's administrator to add you under Team, using the same email you use here. Then open this page again.</p>
        </Panel>
      );
  }
}
