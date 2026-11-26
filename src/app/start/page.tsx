import StartOnboardingForm, { type StartPrefill } from "./StartOnboardingForm";
import ExistingApplicationNotice from "./ExistingApplicationNotice";
import { loadPartnerEmbedState } from "@/lib/partners/loadEmbedState";
import { looksLikeOnboardingCode, resolvePartnerByOnboardingCode } from "@/lib/partners/onboardingCode";

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined, max: number): string | undefined => {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;
};

/**
 * The Get Started form. A partner's link adds `partner` (its code), `ref` (the
 * partner's own id for the organization), `embed=1` to show it inside the partner's
 * screen, and optional prefills (`org`, `name`, `email`, `phone`, `website`).
 * Prefills only fill the boxes; the person can change them. An unknown code just
 * leaves the application untagged.
 */
export default async function StartPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const code = first(params.partner, 60);
  const partnerCode = looksLikeOnboardingCode(code) ? code : null;

  // A link that names the organization (partner code + the partner's own id for it) must not open a second
  // blank form once that organization has applied. It shows the application's status instead. Without a
  // reference, or for a new organization, the form shows as before.
  const reference = first(params.ref, 120);
  if (partnerCode && reference) {
    const partner = await resolvePartnerByOnboardingCode(partnerCode);
    if (partner) {
      const state = await loadPartnerEmbedState(partner.id, reference);
      if (state.kind !== "form") return <ExistingApplicationNotice state={state} />;
    }
  }

  const prefill: StartPrefill = {
    organizationName: first(params.org, 200),
    contactName: first(params.name, 200),
    contactEmail: first(params.email, 254),
    contactPhone: first(params.phone, 40),
    website: first(params.website, 300),
  };

  return (
    <StartOnboardingForm
      embed={Boolean(partnerCode) && first(params.embed, 2) === "1"}
      partnerCode={partnerCode}
      partnerReference={first(params.ref, 120) ?? null}
      partnerAgent={first(params.agent, 60) ?? null}
      prefill={prefill}
    />
  );
}
