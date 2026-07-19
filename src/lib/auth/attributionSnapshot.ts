/**
 * Team-access Checkpoint 3: the single place that turns "a giving link" into
 * "the attribution to snapshot on a new Payment/FinixSubscription." Pulled
 * out as a pure function (rather than inlined at each of the 4 call sites —
 * donate route, admin take-a-payment/subscription-create, webhook-generated
 * recurring charges) so the same-church guard and null-handling are
 * enforced identically everywhere and are independently testable.
 *
 * Deliberately takes only the minimal shape it needs, not a full Payment or
 * GivingLink record — this makes the "attribution can only ever come from
 * these two fields" contract visible at the type level.
 */
export function resolvePaymentAttributionFromGivingLink(
  link: { ownerUserId: string | null; churchId: string } | null,
  paymentChurchId: string
): string | null {
  if (!link) return null;
  // Defense in depth: every call site already scopes its GivingLink lookup
  // by churchId, so this should never actually fire — but attribution is
  // sensitive enough that a future call site skipping that scoping should
  // fail closed (null) here rather than silently attribute cross-church.
  if (link.churchId !== paymentChurchId) return null;
  return link.ownerUserId;
}

/**
 * A generated recurring charge inherits its subscription's own
 * already-snapshotted attribution — this function intentionally has no
 * parameter that could reference the giving link, so there is no way to
 * accidentally re-derive attribution from the (possibly since-reassigned)
 * link when wiring a new call site.
 */
export function resolveRecurringPaymentAttribution(subscription: { attributedUserId: string | null }): string | null {
  return subscription.attributedUserId;
}
