import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { finixClient } from "@/lib/finix/client";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      organizationName,
      organizationType,
      contactName,
      contactEmail,
      contactPhone,
      website,
      legal,
    } = body;

    const reqHeaders = await headers();
    const ipAddress = reqHeaders.get("x-forwarded-for") || reqHeaders.get("x-real-ip") || "unknown";
    const userAgent = reqHeaders.get("user-agent") || "unknown";

    // Create the basic OnboardingApplication in DB
    const application = await prisma.onboardingApplication.create({
      data: {
        organizationName,
        organizationType,
        contactName,
        contactEmail,
        contactPhone,
        website,
        status: "DRAFT", // Will update to SUBMITTED after Finix completion if needed
      },
    });

    // Save Legal Acceptance
    await prisma.legalAcceptance.create({
      data: {
        onboardingApplicationId: application.id,
        acceptedWgcTermsAt: legal.wgcTerms ? new Date() : null,
        acceptedWgcFeesAt: legal.wgcFees ? new Date() : null,
        acceptedWgcPrivacyAt: legal.wgcPrivacy ? new Date() : null,
        acceptedFinixTermsAt: legal.finixTerms ? new Date() : null,
        acceptedFinixPrivacyAt: legal.finixPrivacy ? new Date() : null,
        accepterName: contactName,
        accepterEmail: contactEmail,
        accepterIpAddress: ipAddress,
        accepterUserAgent: userAgent,
        wgcTermsVersion: "1.0",
        wgcFeesVersion: "1.0",
        wgcPrivacyVersion: "1.0",
        finixTermsUrl: process.env.NEXT_PUBLIC_FINIX_TERMS_URL || "https://finix.com/terms",
        finixPrivacyUrl: process.env.NEXT_PUBLIC_FINIX_PRIVACY_URL || "https://finix.com/privacy",
        source: "website_onboarding",
      },
    });

    // Create Finix Hosted Onboarding form
    // According to Finix docs, an empty payload or basic merchant info can be passed
    const finixFormPayload = {
      merchant_setup_instructions: {
        legal_entity_name: organizationName,
        entity_type: organizationType === "Nonprofit" ? "NON_PROFIT" : "CORPORATION", // simplified
        default_statement_descriptor: organizationName.substring(0, 20),
      }
    };
    
    let finixForm;
    try {
      finixForm = await finixClient.createOnboardingForm(finixFormPayload);
    } catch (err) {
      console.error("Finix form creation failed:", err);
      return NextResponse.json({ error: "Failed to initialize secure onboarding" }, { status: 500 });
    }

    // Create Finix Hosted Onboarding link
    let finixLink;
    try {
      const returnUrl = `${process.env.NEXT_PUBLIC_APP_URL}/onboarding/success?app_id=${application.id}`;
      finixLink = await finixClient.createOnboardingFormLink(finixForm.id, {
        return_url: returnUrl,
        expiration_in_minutes: 1440, // 24 hours
      });
    } catch (err) {
      console.error("Finix link creation failed:", err);
      return NextResponse.json({ error: "Failed to generate secure onboarding link" }, { status: 500 });
    }

    // Update Application with Finix details
    await prisma.onboardingApplication.update({
      where: { id: application.id },
      data: {
        status: "ONBOARDING_LINK_CREATED",
        finixOnboardingFormId: finixForm.id,
        finixOnboardingUrl: finixLink.link_url,
      },
    });

    // Return the redirect URL to the client
    return NextResponse.json({ 
      success: true, 
      redirectUrl: finixLink.link_url 
    });

  } catch (error: any) {
    console.error("Onboarding API error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
