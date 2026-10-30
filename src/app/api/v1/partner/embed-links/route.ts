import { apiError, apiSuccess } from "@/lib/api/response";
import { EMBED_LINKS_PER_MINUTE, recordEmbedLinkRequest } from "@/lib/partners/embedLinkRequests";
import { withPartnerApiAuth } from "@/lib/partners/partnerApiAuth";
import { createPartnerEmbedLinkToken } from "@/lib/partners/embedLink";
import { isValidEmail } from "@/lib/donors/donorContact";

const text = (value: unknown, max: number): string | undefined => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined);

/**
 * One link for the iframe a partner shows inside its own product for ONE organization
 * (its own id for it, e.g. a CRM location id). What the frame shows follows the
 * organization: the application form, "submitted", what more is needed, and once
 * approved the organization's dashboard. The partner comes from the key; the link
 * is signed and expires in 15 minutes, so ask for a new one each time the page opens.
 */
export const POST = withPartnerApiAuth(async (req, auth, requestId) => {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return apiError("validation_error", "Send a JSON body with the `reference` of the organization.", requestId);
  }

  const reference = text(body.reference, 120);
  if (!reference) return apiError("validation_error", "`reference` is required: your own id for this organization.", requestId);

  const email = text(body.email, 254)?.toLowerCase();
  if (email && !isValidEmail(email)) return apiError("validation_error", "`email` must be a valid email address.", requestId);

  const contactEmail = text(body.contactEmail, 254);
  if (contactEmail && !isValidEmail(contactEmail)) return apiError("validation_error", "`contactEmail` must be a valid email address.", requestId);

  const recorded = await recordEmbedLinkRequest({ partnerId: auth.partnerId, partnerKeyId: auth.partnerKeyId, reference });
  if (recorded === "too_many") {
    return apiError("rate_limit_error", `Too many link requests (${EMBED_LINKS_PER_MINUTE} per minute per key). Wait a moment and try again.`, requestId);
  }

  const { token, expiresAt } = createPartnerEmbedLinkToken({
    partnerId: auth.partnerId,
    reference,
    email: email ?? null,
    prefill: {
      organizationName: text(body.organizationName, 200),
      contactName: text(body.contactName, 200),
      // The person opening the frame is who fills in the application, so by default their own email
      // becomes the organization's contact. It must match the email the partner sends later for that
      // person, because that is how the dashboard finds them.
      contactEmail: contactEmail ?? email,
      contactPhone: text(body.contactPhone, 40),
      website: text(body.website, 300),
    },
  });

  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  return apiSuccess({ url: `${origin}/partner-embed?link=${token}`, expiresAt: expiresAt.toISOString() }, requestId);
});
