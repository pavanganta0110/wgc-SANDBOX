import { NextResponse } from "next/server";
import { loadPublicGivingPageData } from "@/lib/givingLinks/loadPublicGivingPageData";
import { resolveEmbedCorsOrigin, embedCorsHeaders, embedPreflightResponse } from "@/lib/giving/embedCors";
import { checkEmbedRateLimit } from "@/lib/giving/embedRateLimit";

/**
 * Public configuration for the wgc-giving.js inline embed. Returns ONLY
 * safe, already-public-facing values — the same fields the hosted
 * /embed/[slug] page already renders into HTML for anyone to view-source,
 * just as structured JSON. Never returns Finix/merchant credentials,
 * webhook secrets, bank details, or the internal church.id.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const origin = req.headers.get("origin");

  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
  if (!checkEmbedRateLimit(`embed-public-config:${ip}:${slug}`)) {
    const allowOrigin = await resolveEmbedCorsOrigin(slug, origin);
    return NextResponse.json({ ok: false, error: "Too many requests. Please try again shortly." }, { status: 429, headers: embedCorsHeaders(allowOrigin) });
  }

  const allowOrigin = await resolveEmbedCorsOrigin(slug, origin);
  if (origin && !allowOrigin) {
    return NextResponse.json({ ok: false, error: "This domain is not authorized to embed this giving page." }, { status: 403, headers: embedCorsHeaders(null) });
  }
  const headers = embedCorsHeaders(allowOrigin);

  const data = await loadPublicGivingPageData(slug);
  if (!data.ok) {
    if (data.notFound) {
      return NextResponse.json({ ok: false, error: "This giving page could not be found." }, { status: 404, headers });
    }
    return NextResponse.json({ ok: false, error: data.message }, { status: 410, headers });
  }

  const {
    link,
    church,
    branding,
    light,
    donorFieldSettings,
    allowedPaymentMethods,
    allowedFrequencies,
    suggestedAmountsCents,
    serverAvailability,
    logoUrl,
    fundSelectionEnabled,
    assignedFunds,
  } = data;

  return NextResponse.json(
    {
      ok: true,
      slug,
      organization: { name: church.name, logoUrl },
      givingPage: { title: link.publicTitle, description: link.description || "" },
      amount: {
        type: link.amountType,
        fixedAmountCents: link.fixedAmountCents,
        minAmountCents: link.minAmountCents,
        maxAmountCents: link.maxAmountCents,
        suggestedAmountsCents,
        allowCustomAmount: link.allowCustomAmount,
      },
      recurring: { enabled: link.recurringEnabled, allowedFrequencies },
      funds: {
        selectionEnabled: fundSelectionEnabled,
        options: assignedFunds.map((f) => ({ id: f.fundId, name: f.name, isDefault: f.isDefault })),
      },
      paymentMethods: allowedPaymentMethods,
      donorFields: donorFieldSettings,
      feeCover: { enabled: link.feeCoverEnabled, defaultOn: link.feeCoverDefaultOn },
      branding: {
        primaryColor: light.buttonBackground,
        buttonTextColor: light.buttonText,
        headerBackground: light.headerBackground,
        pageBackground: light.pageBackground,
        borderColor: light.borderColor,
        headingColor: light.headingColor,
        bodyTextColor: light.bodyTextColor,
        campaignImageUrl: branding.campaignImageUrl,
        showPoweredByWgc: !branding.hideFooter,
        thankYouMessage: branding.thankYouMessage,
      },
      wallets: {
        // Inline Apple Pay / Google Pay buttons require the host merchant's
        // own domain to be registered/approved with Apple/Google — WGC's
        // embed script cannot satisfy that per-arbitrary-domain, so the
        // client always falls back to "Continue securely to use X", which
        // opens the hosted giving page (the domain that IS registered).
        // These flags only describe whether the org has the method enabled
        // at all — the client must not read them as "safe to render inline".
        applePayEnabled: allowedPaymentMethods.includes("APPLE_PAY") && serverAvailability.APPLE_PAY.enabledForOrganization,
        googlePayEnabled: allowedPaymentMethods.includes("GOOGLE_PAY") && serverAvailability.GOOGLE_PAY.enabledForOrganization,
      },
      finix: {
        applicationId: process.env.NEXT_PUBLIC_FINIX_APPLICATION_ID || "",
        environment: process.env.NEXT_PUBLIC_FINIX_ENV === "live" ? "live" : "sandbox",
        // Finix's own per-church routing identity — already shipped to the
        // browser today as a plain prop on the hosted /g/[slug] and
        // /embed/[slug] pages (see EmbedBridge/GivingLinkForm), required
        // client-side for Finix.Auth's fraud session and PaymentForm scoping.
        merchantId: church.finixMerchantId,
      },
      hostedGivingUrl: `${new URL(req.url).origin}/embed/${encodeURIComponent(slug)}`,
    },
    { headers }
  );
}

export async function OPTIONS(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const allowOrigin = await resolveEmbedCorsOrigin(slug, req.headers.get("origin"));
  return embedPreflightResponse(allowOrigin);
}
