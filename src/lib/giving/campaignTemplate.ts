import crypto from "crypto";

/** Every merge field a campaign template can reference. Kept as a small,
 * fixed set (not arbitrary donor fields) so a template can never leak a
 * field the composer UI doesn't explicitly offer/preview. */
export interface CampaignTemplateVars {
  firstName: string;
  churchName: string;
  link: string;
}

// {{orgName}} is the current, composer-facing merge field — "church" reads
// wrong for the nonprofit/school/association organizations WGC also
// serves. {{churchName}} is kept as an accepted alias, never removed: any
// campaign already drafted (not yet sent) with {{churchName}} literally
// typed into its saved emailBodyTemplate/textBodyTemplate/emailSubject
// must keep rendering correctly, not start showing the raw, unreplaced
// token once this ships.
const MERGE_FIELD_PATTERN = /\{\{\s*(firstName|orgName|churchName|link)\s*\}\}/g;

/** Replaces {{firstName}}/{{orgName}}/{{link}} (and the legacy
 * {{churchName}} alias) in a template — used both for the live preview
 * (composer types, sees the real result) and for the actual per-recipient
 * send, so preview and send can never drift apart by using two different
 * rendering implementations. */
export function renderCampaignTemplate(template: string, vars: CampaignTemplateVars): string {
  return template.replace(MERGE_FIELD_PATTERN, (_match, field: string) =>
    field === "orgName" ? vars.churchName : vars[field as keyof CampaignTemplateVars]
  );
}

/** Opaque per-recipient tracking token — same random-hex pattern as every
 * other unguessable token in this codebase (setupLinkToken.ts, etc.). Long
 * enough that enumerating another recipient's link isn't feasible; this
 * token IS effectively a bearer credential for "redirect to the giving
 * page and get this specific payment attributed to this specific person,"
 * so it needs the same unguessability as a password-reset token, not a
 * short display code like the MFA codes.
 */
export function generateCampaignTrackingToken(): string {
  return crypto.randomBytes(24).toString("hex");
}
