/**
 * The full catalog of event types WGC emits. This is the single source of
 * truth consumed by: outbound webhook delivery, the merchant dashboard's
 * webhook-subscription picker, and (later) Zapier/Make triggers — adding a
 * new event type here does not require a migration (WebhookEvent.type and
 * WebhookEndpoint.subscribedEventsJson are plain strings/JSON, not a
 * Prisma enum), only wiring an emitEvent() call at the new event's source.
 *
 * Every event type listed here is either already emitted by application
 * code (see the file:line references) or explicitly not yet wired — check
 * src/lib/events/emitEvent.ts call sites before assuming one fires today.
 */
export const WGC_EVENT_TYPES = [
  "donor.created",
  "donor.updated",
  "donation.created",
  "donation.refunded",
  "donation.returned",
  "recurring.created",
  "recurring.updated",
  "recurring.cancelled",
  "recurring.payment_failed",
  "recurring.payment_recovered",
  "recurring.retry_scheduled",
  "recurring.cancelled_after_failure",
  "invoice.created",
  "invoice.paid",
  "settlement.created",
  "campaign.created",
  "campaign.updated",
  "campaign.completed",
  "fundraiser.created",
  "fundraiser.updated",
  "team.created",
  "team.updated",
] as const;

export type WgcEventType = (typeof WGC_EVENT_TYPES)[number];

export function isWgcEventType(value: unknown): value is WgcEventType {
  return typeof value === "string" && (WGC_EVENT_TYPES as readonly string[]).includes(value);
}

/** Human-readable label + one-line description for the dashboard's event picker. */
export const WGC_EVENT_DESCRIPTIONS: Record<WgcEventType, string> = {
  "donor.created": "A new donor record was created.",
  "donor.updated": "An existing donor's profile was updated.",
  "donation.created": "A donation succeeded (one-time or recurring charge).",
  "donation.refunded": "A donation was refunded.",
  "donation.returned": "An ACH donation was returned by the bank.",
  "recurring.created": "A new recurring giving subscription was created.",
  "recurring.updated": "A recurring giving subscription's state changed.",
  "recurring.cancelled": "A recurring giving subscription was cancelled.",
  "recurring.payment_failed": "A recurring charge failed to process.",
  "recurring.payment_recovered": "A recurring charge succeeded after a prior failure on the same subscription.",
  "recurring.retry_scheduled": "A donor was sent a secure link to update their payment method after a failed recurring charge.",
  "recurring.cancelled_after_failure": "A recurring giving subscription was cancelled while past-due, rather than voluntarily.",
  "invoice.created": "A new invoice was created.",
  "invoice.paid": "An invoice was paid in full.",
  "settlement.created": "A new settlement was recorded.",
  "campaign.created": "A new fundraising campaign was created.",
  "campaign.updated": "A fundraising campaign was updated.",
  "campaign.completed": "A fundraising campaign was marked completed.",
  "fundraiser.created": "A new individual fundraiser was added to a campaign.",
  "fundraiser.updated": "A fundraiser's profile, goal, or team assignment was updated.",
  "team.created": "A new fundraising team was created.",
  "team.updated": "A team's name or goal was updated.",
};
