import type { ReactNode } from "react";
import { CheckCircle, Clock, FileWarning, XCircle } from "lucide-react";
import AutoRefresh from "@/app/partner-embed/AutoRefresh";
import type { PartnerEmbedState } from "@/lib/partners/loadEmbedState";

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
 * What the plain Get Started link (/start?partner=…&ref=…) shows when this organization has already applied,
 * instead of a second blank form. Status only: it never names the organization, lists what is missing or
 * signs anyone in, because this link is not signed. The signed /partner-embed link does those things.
 */
export default function ExistingApplicationNotice({ state }: { state: Exclude<PartnerEmbedState, { kind: "form" }> }) {
  switch (state.kind) {
    case "pending":
      return (
        <Panel icon={<CheckCircle className="w-8 h-8" />} tone="bg-green-50 text-green-600" title={state.stage === "submitted" ? "Application submitted" : "Application under review"}>
          <p>Your application is already in. Reviews are completed within 48 hours, often quicker.</p>
          <p>This page updates by itself when there is news. You don&apos;t need to apply again.</p>
          <AutoRefresh />
        </Panel>
      );
    case "information_required":
      return (
        <Panel icon={<FileWarning className="w-8 h-8" />} tone="bg-amber-50 text-amber-600" title="More information needed">
          <p>Your application is waiting on more information. Open your account again from the software you started it in to see what to add.</p>
          <AutoRefresh />
        </Panel>
      );
    case "setting_up":
    case "ready":
      return (
        <Panel icon={<CheckCircle className="w-8 h-8" />} tone="bg-green-50 text-green-600" title="Your application was approved">
          <p>{state.kind === "setting_up" ? "We are setting up your account. This takes a moment." : "Your account is ready."}</p>
          <p>Open WGC Payments from the software you started it in to reach your dashboard. You don&apos;t need to apply again.</p>
          {state.kind === "setting_up" && <AutoRefresh seconds={10} />}
        </Panel>
      );
    case "rejected":
      return (
        <Panel icon={<XCircle className="w-8 h-8" />} tone="bg-red-50 text-red-600" title="Application not approved">
          <p>We could not approve this application. Please contact support to talk about next steps.</p>
        </Panel>
      );
    case "failed":
      return (
        <Panel icon={<Clock className="w-8 h-8" />} tone="bg-red-50 text-red-600" title="Application could not be completed">
          <p>Something went wrong while submitting this application. Please contact support.</p>
        </Panel>
      );
  }
}
