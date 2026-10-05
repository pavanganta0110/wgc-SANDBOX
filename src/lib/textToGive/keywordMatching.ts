/**
 * Text to Give keyword handling. Deliberately reply-only — a donor texting
 * a keyword gets a link back, never an auto-charge over SMS (explicitly
 * out of scope per the product spec). Live sending stays gated behind
 * TWILIO_DONOR_FROM_NUMBER, same guard as sendText.ts, until a dedicated
 * A2P 10DLC campaign for this traffic is approved.
 */

export function normalizeKeyword(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function buildDefaultReplyMessage(params: { churchName: string; campaignName: string; giveUrl: string }): string {
  return `${params.churchName}: Thanks for your interest in ${params.campaignName}! Give here: ${params.giveUrl}`;
}
