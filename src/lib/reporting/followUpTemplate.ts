import { renderCampaignTemplate } from "@/lib/giving/campaignTemplate";
import { escapeHtml } from "@/lib/eventRegistration/emailTemplates";

/**
 * Pure (no DB) pieces of the Lapsed Donors "Email" follow-up, shared by the
 * composer dialog (default text) and the preview/send route (rendering), so
 * what the merchant previews is exactly what is sent.
 */

export const FOLLOW_UP_SUBJECT_MAX = 200;
export const FOLLOW_UP_BODY_MAX = 5000;

export const DEFAULT_FOLLOW_UP_SUBJECT = "We miss you, {{firstName}}";

export const DEFAULT_FOLLOW_UP_BODY = `Hi {{firstName}},

Thank you for your past generosity to {{orgName}}. It has made a real difference, and we'd love to stay connected.

If you'd like to catch up or have any questions, just reply to this email.`;

export interface FollowUpVars {
  firstName: string;
  churchName: string;
}

/** First word of the donor's name, or "there" when there is no usable name. */
export function followUpFirstName(formattedName: string): string {
  const first = formattedName.trim().split(/\s+/)[0];
  return !first || first === "—" ? "there" : first;
}

export function renderFollowUpSubject(template: string, vars: FollowUpVars): string {
  return renderCampaignTemplate(template, { ...vars, link: "" }).replace(/[\r\n]+/g, " ").trim();
}

/** Merge fields are filled first, then the whole result is HTML-escaped, so a donor name can never inject markup. */
export function renderFollowUpBodyHtml(template: string, vars: FollowUpVars): string {
  const text = renderCampaignTemplate(template, { ...vars, link: "" }).replace(/\r\n/g, "\n").trim();
  return text
    .split(/\n{2,}/)
    .map((para) => `<p style="margin:0 0 16px 0;">${escapeHtml(para).replace(/\n/g, "<br/>")}</p>`)
    .join("");
}
