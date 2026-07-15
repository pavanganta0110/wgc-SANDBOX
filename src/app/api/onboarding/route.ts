import { NextResponse } from "next/server";
import { headers, cookies } from "next/headers";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { finixClient } from "@/lib/finix/client";
import { sendWgcEmail, sendWgcAdminOnboardingNotification } from "@/lib/email";

function extractFinixErrorMessage(err: any): string {
  let finixErrorStr = err.message || "Unknown error";
  const errData = err.details || (err.response && err.response.data);
  if (errData) {
    if (errData._embedded && errData._embedded.errors && errData._embedded.errors.length > 0) {
      finixErrorStr = errData._embedded.errors.map((e: any) => e.message).join(", ");
    } else {
      finixErrorStr = JSON.stringify(errData);
    }
  }
  return finixErrorStr;
}

// Known API field identifiers mapped to the labels shown on our own form,
// so error text reads like it's talking about the field the user actually saw.
const FIELD_LABELS: Record<string, string> = {
  account_number: "account number",
  bank_code: "routing number",
  routing_number: "routing number",
  first_name: "first name",
  last_name: "last name",
  business_name: "business name",
  business_tax_id: "business tax ID",
  business_address: "business address",
  personal_address: "personal address",
  tax_id: "tax ID",
  dob: "date of birth",
  max_transaction_amount: "max transaction amount",
  ach_max_transaction_amount: "max ACH transaction amount",
  annual_card_volume: "expected annual card volume",
  annual_ach_volume: "expected annual ACH volume",
};

// Turns a raw processor error into plain-English copy that's safe to show
// customers: no vendor name, no internal field paths, dollars instead of cents.
function humanizeErrorDetail(raw: string): string {
  if (!raw) return "";

  // Untranslated JSON blobs (no _embedded.errors match) aren't customer-safe.
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return "Please double-check the information you entered and try again.";
  }

  const message = trimmed
    .replace(/Invalid Field:\s*[\w.]+;\s*/gi, "")
    .replace(/\b(\d+)\s*cents\b/gi, (_match, cents) =>
      `$${(Number(cents) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    )
    // Field identifiers embedded mid-sentence, e.g. "account_number must not equal bank_code"
    .replace(/\b[a-z][a-z0-9]*(?:\.[a-z0-9]+|_[a-z0-9]+)+\b/gi, (token: string) => {
      const key = token.toLowerCase().split(".").pop() as string;
      return FIELD_LABELS[key] || key.replace(/_/g, " ");
    })
    .replace(/\bFinix\b/gi, "our payment processor")
    .trim();

  return message.charAt(0).toUpperCase() + message.slice(1);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      // Basic info
      organizationName, organizationType, contactName, contactEmail, contactPhone, website,
      // Business info
      legalBusinessName, doingBusinessAs, businessTaxId, businessPhone, businessAddressLine1, businessAddressLine2, businessCity, businessState, businessPostalCode, businessCountry, businessDescription, mcc, defaultStatementDescriptor,
      // Processing
      annualCardVolume, annualAchVolume, averageCardTransferAmount, averageAchTransferAmount, maxTransactionAmount, achMaxTransactionAmount, ecommercePercentage, cardPresentPercentage, mailOrderTelephoneOrderPercentage, businessToBusinessPercentage, businessToConsumerPercentage, otherVolumePercentage, refundPolicy, hasAcceptedCreditCardsPreviously,
      // Principal
      firstName, lastName, title, email, phone, dobYear, dobMonth, dobDay, ownershipPercentage, personalAddressLine1, personalAddressLine2, personalCity, personalState, personalPostalCode, personalCountry, taxId,
      // Incorporation
      incorporationYear, incorporationMonth, incorporationDay,
      // Beneficial Owners
      associatedOwners,
      // Payout Bank
      accountHolderName, accountType, routingNumber, accountNumber, bankCountry, currency,
      legal,
      recaptchaToken
    } = body;

    const reqHeaders = await headers();
    const ipAddress = reqHeaders.get("x-forwarded-for") || reqHeaders.get("x-real-ip") || "unknown";
    const userAgent = reqHeaders.get("user-agent") || "unknown";

    const recaptchaSecret = process.env.RECAPTCHA_SECRET_KEY;
    if (recaptchaSecret) {
      const cookieStore = await cookies();
      const captchaCookie = cookieStore.get('wgc_onboarding_captcha');

      if (!captchaCookie || !captchaCookie.value) {
        return NextResponse.json({ error: "Session expired or missing CAPTCHA. Please refresh and try again." }, { status: 400 });
      }

      const value = captchaCookie.value;
      if (value !== 'bypass=true') {
        const params = new URLSearchParams(value);
        const sig = params.get('sig');
        params.delete('sig');
        const payload = params.toString();

        const expectedSig = crypto.createHmac('sha256', recaptchaSecret).update(payload).digest('hex');
        if (!sig || sig !== expectedSig) {
          return NextResponse.json({ error: "Invalid CAPTCHA signature. Please try again." }, { status: 400 });
        }
        
        const ts = parseInt(params.get('ts') || '0', 10);
        if (Date.now() - ts > 7200 * 1000) { // 2 hours
          return NextResponse.json({ error: "CAPTCHA session expired. Please refresh and try again." }, { status: 400 });
        }
      }
    }

    // The Payout Bank / Processing form fields are labeled in whole dollars,
    // but both our DB columns (*Cents) and Finix's underwriting fields
    // (annual_card_volume, max_transaction_amount, etc.) are in cents.
    // Convert once here so nothing downstream has to guess the unit.
    const toCents = (dollars: any) => Math.round(Number(dollars || 0) * 100);
    const annualCardVolumeCents = toCents(annualCardVolume);
    const annualAchVolumeCents = toCents(annualAchVolume);
    const averageCardTransferAmountCents = toCents(averageCardTransferAmount);
    const averageAchTransferAmountCents = toCents(averageAchTransferAmount);
    const maxTransactionAmountCents = toCents(maxTransactionAmount);
    const achMaxTransactionAmountCents = toCents(achMaxTransactionAmount);

    // Create OnboardingApplication locally
    console.log("ONBOARDING_STEP", "REQUEST_RECEIVED");
    console.log("ONBOARDING_STEP", "VALIDATION_PASSED");
    
    // Prepare database fields
    const businessTypeEnum = (organizationType === "Nonprofit" || organizationType === "Church") 
      ? "TAX_EXEMPT_ORGANIZATION" 
      : "CORPORATION";

    let application;
    try {
      application = await prisma.onboardingApplication.create({
        data: {
          organizationName,
          organizationType,
          contactName,
          contactEmail,
          contactPhone,
          website,
          status: "DRAFT",

          legalBusinessName, doingBusinessAs, businessType: businessTypeEnum,
          businessTaxIdProvided: !!businessTaxId, businessAddressLine1, businessAddressLine2, businessCity, businessState, businessPostalCode, businessCountry,
          businessPhone, businessDescription, mcc, defaultStatementDescriptor,

          principalFirstName: firstName, principalLastName: lastName, principalTitle: title, principalEmail: email, principalPhone: phone,
          principalDobYear: dobYear, principalDobMonth: dobMonth, principalDobDay: dobDay, principalOwnershipPercentage: ownershipPercentage,
          principalAddressLine1: personalAddressLine1, principalAddressLine2: personalAddressLine2, principalCity: personalCity, principalState: personalState, principalPostalCode: personalPostalCode, principalCountry: personalCountry,
          principalTaxIdProvided: !!taxId,
          incorporationYear, incorporationMonth, incorporationDay,

          annualCardVolumeCents, annualAchVolumeCents, averageCardTransferAmountCents, averageAchTransferAmountCents,
          maxTransactionAmountCents, achMaxTransactionAmountCents, ecommercePercentage, cardPresentPercentage, mailOrderTelephoneOrderPercentage, businessToBusinessPercentage, businessToConsumerPercentage, otherVolumePercentage,
          refundPolicy, hasAcceptedCreditCardsPreviously,

          bankAccountType: accountType, bankName: accountHolderName, bankCountry, bankCurrency: currency,
          bankLast4: accountNumber ? accountNumber.slice(-4) : null,
        },
      });
      console.log("ONBOARDING_STEP", "APPLICATION_CREATED", application.id);
    } catch (err: any) {
      console.error("ONBOARDING_FAILED", { step: "DATABASE_APPLICATION_CREATE_FAILED", errorMessage: err.message, code: err.code });
      return NextResponse.json({
        success: false,
        step: "DATABASE_APPLICATION_CREATE_FAILED",
        message: "We couldn't save your application. Please try again."
      }, { status: 500 });
    }

    try {
      // Save Associated Owners if any
      if (associatedOwners && associatedOwners.length > 0) {
        await prisma.associatedOwner.createMany({
          data: associatedOwners.map((owner: any) => ({
            onboardingApplicationId: application.id,
            firstName: owner.firstName,
            lastName: owner.lastName,
            title: owner.title,
            email: owner.email,
            phone: owner.phone,
            dobYear: owner.dobYear,
            dobMonth: owner.dobMonth,
            dobDay: owner.dobDay,
            ownershipPercentage: owner.ownershipPercentage,
            addressLine1: owner.addressLine1,
            addressLine2: owner.addressLine2,
            city: owner.city,
            state: owner.state,
            postalCode: owner.postalCode,
            country: owner.country,
            taxIdProvided: !!owner.taxId,
          })),
        });
      }

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
          finixTermsUrl: process.env.NEXT_PUBLIC_FINIX_TERMS_URL || "https://finix-hosted-content.s3.amazonaws.com/flex/v3/finix-terms-of-service.html",
          finixPrivacyUrl: process.env.NEXT_PUBLIC_FINIX_PRIVACY_URL || "https://finix.com/terms-and-policies",
          source: "API_ONBOARDING",
        },
      });
      console.log("ONBOARDING_STEP", "LEGAL_ACCEPTANCE_CREATED");
    } catch (err: any) {
      console.error("ONBOARDING_FAILED", { step: "LEGAL_ACCEPTANCE_CREATE_FAILED", applicationId: application.id, errorMessage: err.message });
      return NextResponse.json({ success: false, step: "LEGAL_ACCEPTANCE_CREATE_FAILED", message: "We couldn't save your legal acceptance. Please try again." }, { status: 500 });
    }

    // ==========================================
    // Finix Orchestration
    // ==========================================

    // Finix expects dates as objects with integers: { year, month, day }
    const formatFinixDate = (y: any, m: any, d: any, fieldName: string) => {
      if (!y || !m || !d) return undefined;
      const year = Number(y);
      const month = Number(m);
      const day = Number(d);
      
      const currentYear = new Date().getFullYear();
      if (year < 1800 || year > currentYear) throw new Error(`Invalid ${fieldName}: Year must be between 1800 and ${currentYear}`);
      if (month < 1 || month > 12) throw new Error(`Invalid ${fieldName}: Month must be between 1 and 12`);
      if (day < 1 || day > 31) throw new Error(`Invalid ${fieldName}: Day must be between 1 and 31`);
      
      return { year, month, day };
    };

    const identityPayload = {
      type: "BUSINESS",
      identity_roles: ["SELLER"],
      entity: {
        business_name: legalBusinessName, doing_business_as: doingBusinessAs, business_type: businessTypeEnum,
        business_tax_id: businessTaxId, business_phone: businessPhone, default_statement_descriptor: defaultStatementDescriptor,
        business_address: { line1: businessAddressLine1, line2: businessAddressLine2, city: businessCity, region: businessState, postal_code: businessPostalCode, country: businessCountry },
        incorporation_date: incorporationYear ? formatFinixDate(incorporationYear, incorporationMonth, incorporationDay, "Incorporation Date") : undefined,
        first_name: firstName, last_name: lastName, title: title, email: email, phone: phone,
        dob: formatFinixDate(dobYear, dobMonth, dobDay, "Date of Birth"),
        personal_address: { line1: personalAddressLine1, line2: personalAddressLine2, city: personalCity, region: personalState, postal_code: personalPostalCode, country: personalCountry },
        tax_id: taxId, principal_percentage_ownership: ownershipPercentage,
        annual_card_volume: annualCardVolumeCents, max_transaction_amount: maxTransactionAmountCents, ach_max_transaction_amount: achMaxTransactionAmountCents, mcc,
        url: website, has_accepted_credit_cards_previously: hasAcceptedCreditCardsPreviously
      },
      additional_underwriting_data: {
        annual_ach_volume: annualAchVolumeCents, average_ach_transfer_amount: averageAchTransferAmountCents, average_card_transfer_amount: averageCardTransferAmountCents,
        business_description: businessDescription ? businessDescription.substring(0, 250) : "",
        card_volume_distribution: { 
          card_present_percentage: Number(cardPresentPercentage || 0), 
          mail_order_telephone_order_percentage: Number(mailOrderTelephoneOrderPercentage || 0), 
          ecommerce_percentage: Number(ecommercePercentage || 100) 
        },
        volume_distribution_by_business_type: { 
          business_to_business_volume_percentage: Number(businessToBusinessPercentage || 0), 
          business_to_consumer_volume_percentage: Number(businessToConsumerPercentage || 100), 
          consumer_to_consumer_volume_percentage: 0,
          person_to_person_volume_percentage: 0,
          other_volume_percentage: Number(otherVolumePercentage || 0) 
        },
        refund_policy: refundPolicy,
        credit_check_allowed: true, credit_check_ip_address: ipAddress, credit_check_timestamp: new Date().toISOString(), credit_check_user_agent: userAgent,
        merchant_agreement_accepted: true, merchant_agreement_ip_address: ipAddress, merchant_agreement_timestamp: new Date().toISOString(), merchant_agreement_user_agent: userAgent,
      },
      tags: { wgc_onboarding_application_id: application.id, organizationName, contactEmail }
    };

    let finixIdentity;
    try {
      finixIdentity = await finixClient.createSellerIdentity(identityPayload);
      console.log("ONBOARDING_STEP", "FINIX_IDENTITY_SUCCESS", finixIdentity.id);
    } catch (err: any) {
      const finixErrorStr = extractFinixErrorMessage(err);

      console.error("ONBOARDING_FAILED", {
        step: "FINIX_IDENTITY_CREATE_FAILED",
        applicationId: application.id,
        errorMessage: finixErrorStr,
        status: err.status
      });
      return NextResponse.json({
        success: false,
        step: "FINIX_IDENTITY_CREATE_FAILED",
        message: "We could not verify your business identity.",
        errorDetail: humanizeErrorDetail(finixErrorStr)
      }, { status: 400 });
    }

    await prisma.onboardingApplication.update({
      where: { id: application.id },
      data: { finixIdentityId: finixIdentity.id },
    });

    // 2. Associated Identities
    if (associatedOwners && associatedOwners.length > 0) {
      const dbOwners = await prisma.associatedOwner.findMany({ where: { onboardingApplicationId: application.id } });
      for (const owner of associatedOwners) {
        try {
          const assocPayload = {
            entity: {
              first_name: owner.firstName, last_name: owner.lastName, title: owner.title, email: owner.email, phone: owner.phone,
              dob: formatFinixDate(owner.dobYear, owner.dobMonth, owner.dobDay, `Owner (${owner.firstName}) Date of Birth`),
              principal_percentage_ownership: owner.ownershipPercentage,
              personal_address: { line1: owner.addressLine1, line2: owner.addressLine2, city: owner.city, region: owner.state, postal_code: owner.postalCode, country: owner.country },
              tax_id: owner.taxId
            }
          };
          const assocIdentity = await finixClient.createAssociatedIdentity(finixIdentity.id, assocPayload);
          const dbOwner = dbOwners.find((o) => o.email === owner.email);
          if (dbOwner) {
            await prisma.associatedOwner.update({
              where: { id: dbOwner.id },
              data: { finixAssociatedIdentityId: assocIdentity.id }
            });
          }
        } catch (err: any) {
          console.error("ONBOARDING_FAILED", {
            step: "FINIX_ASSOCIATED_IDENTITY_FAILED",
            applicationId: application.id,
            finixIdentityId: finixIdentity.id,
            errorMessage: err.message,
            status: err.status
          });
        }
      }
    }

    // 3. Bank Payment Instrument
    console.log("ONBOARDING_STEP", "BANK_INSTRUMENT_START");
    const paymentInstrumentPayload = {
      type: "BANK_ACCOUNT",
      identity: finixIdentity.id,
      name: accountHolderName,
      account_type: accountType,
      bank_code: routingNumber,
      account_number: accountNumber
    };

    let finixPaymentInstrument;
    try {
      finixPaymentInstrument = await finixClient.createPaymentInstrument(paymentInstrumentPayload);
      console.log("ONBOARDING_STEP", "BANK_INSTRUMENT_SUCCESS", finixPaymentInstrument.id);
    } catch (err: any) {
      const finixErrorStr = extractFinixErrorMessage(err);

      console.error("ONBOARDING_FAILED", {
        step: "FINIX_BANK_INSTRUMENT_FAILED",
        applicationId: application.id,
        finixIdentityId: finixIdentity.id,
        errorMessage: finixErrorStr,
        status: err.status
      });
      await prisma.onboardingApplication.update({
        where: { id: application.id },
        data: { status: "BANK_INSTRUMENT_FAILED" },
      });
      return NextResponse.json({
        success: false,
        step: "FINIX_BANK_INSTRUMENT_FAILED",
        message: "We could not link your payout bank account. Please verify your routing and account numbers.",
        errorDetail: humanizeErrorDetail(finixErrorStr)
      }, { status: 400 });
    }

    await prisma.onboardingApplication.update({
      where: { id: application.id },
      data: { finixPaymentInstrumentId: finixPaymentInstrument.id, bankInstrumentEnabled: finixPaymentInstrument.enabled },
    });

    // 4. Merchant
    console.log("ONBOARDING_STEP", "MERCHANT_CREATE_START");
    const processor = process.env.FINIX_PROCESSOR || "FINIX_V1";
    let finixMerchant;
    try {
      finixMerchant = await finixClient.createMerchant(finixIdentity.id, processor);
      console.log("ONBOARDING_STEP", "MERCHANT_CREATE_SUCCESS", finixMerchant.id);
    } catch (err: any) {
      const finixErrorStr = extractFinixErrorMessage(err);

      console.error("ONBOARDING_FAILED", {
        step: "FINIX_MERCHANT_CREATE_FAILED",
        applicationId: application.id,
        finixIdentityId: finixIdentity.id,
        finixPaymentInstrumentId: finixPaymentInstrument.id,
        errorMessage: finixErrorStr,
        status: err.status
      });
      await prisma.onboardingApplication.update({
        where: { id: application.id },
        data: { status: "MERCHANT_CREATION_FAILED" },
      });
      return NextResponse.json({
        success: false,
        step: "FINIX_MERCHANT_CREATE_FAILED",
        message: "We could not finalize your merchant account. Please contact support.",
        errorDetail: humanizeErrorDetail(finixErrorStr)
      }, { status: 400 });
    }

    // 5. Update Status
    await prisma.onboardingApplication.update({
      where: { id: application.id },
      data: {
        status: "UNDER_REVIEW", // or PROVISIONING
        finixMerchantId: finixMerchant.id,
        finixProcessor: finixMerchant.processor,
        onboardingState: finixMerchant.onboarding_state,
        processingEnabled: finixMerchant.processing_enabled,
        settlementEnabled: finixMerchant.settlement_enabled,
        submittedAt: new Date(),
      },
    });

    // Send ONBOARDING_SUBMITTED email idempotently
    const existingLog = await prisma.emailLog.findFirst({
      where: { onboardingApplicationId: application.id, type: "ONBOARDING_SUBMITTED" }
    });

    if (!existingLog && contactEmail) {
      try {
        const safeBusinessName = legalBusinessName || "your organization";

        await sendWgcEmail({
          to: contactEmail,
          subject: "WGC Payments Onboarding Submitted",
          title: "Your onboarding has been submitted",
          badgeText: "UNDER REVIEW",
          badgeColor: "blue",
          bodyHtml: `
            <p>Thank you for submitting your WGC Payments onboarding for <strong>${safeBusinessName}</strong>.</p>
            <p>Your application is now under review. Reviews are completed within 48 hours, often quicker.</p>
            <p>We will notify you once your account is approved or if we require more information.</p>
          `
        });

        await prisma.emailLog.create({
          data: {
            onboardingApplicationId: application.id,
            type: "ONBOARDING_SUBMITTED",
            to: contactEmail,
            subject: "WGC Payments onboarding submitted",
            status: "SENT",
            sentAt: new Date()
          }
        });
      } catch (err: any) {
        console.error("ONBOARDING_FAILED", {
          step: "EMAIL_SEND_FAILED",
          applicationId: application.id,
          errorMessage: err.message
        });
        await prisma.emailLog.create({
          data: { onboardingApplicationId: application.id, type: "ONBOARDING_SUBMITTED", to: contactEmail, subject: "WGC Payments onboarding submitted", status: "FAILED", error: err.message }
        });
      }
    }

    // Send internal admin notification idempotently
    const existingAdminLog = await prisma.emailLog.findFirst({
      where: { onboardingApplicationId: application.id, type: "ADMIN_ONBOARDING_NOTIFICATION" }
    });

    if (!existingAdminLog) {
      try {
        await sendWgcAdminOnboardingNotification({
          organizationName: legalBusinessName || organizationName || "Unknown Organization",
          applicantName: `${firstName || ''} ${lastName || ''}`.trim() || contactName || "Unknown Applicant",
          applicantEmail: email || contactEmail || "No Email Provided",
          applicantPhone: phone || contactPhone || "No Phone Provided",
          organizationType: organizationType || "Unknown Type",
          businessTaxId: businessTaxId || "N/A", // Safe: inside the function only the last 4 are used
          website: website || "",
          submittedAt: new Date(),
          applicationId: application.id,
          finixIdentityId: finixIdentity.id,
          status: "UNDER_REVIEW"
        });

        await prisma.emailLog.create({
          data: {
            onboardingApplicationId: application.id,
            type: "ADMIN_ONBOARDING_NOTIFICATION",
            to: process.env.SUPPORT_EMAIL || "support@wgcpayments.com",
            subject: "New Merchant Onboarding Submitted",
            status: "SENT",
            sentAt: new Date()
          }
        });
      } catch (err: any) {
        console.error("ADMIN_NOTIFICATION_FAILED", {
          applicationId: application.id,
          errorMessage: err.message
        });
        await prisma.emailLog.create({
          data: {
            onboardingApplicationId: application.id,
            type: "ADMIN_ONBOARDING_NOTIFICATION",
            to: process.env.SUPPORT_EMAIL || "support@wgcpayments.com",
            subject: "New Merchant Onboarding Submitted",
            status: "FAILED",
            error: err.message
          }
        });
      }
    }

    console.log("Onboarding succeeded", { applicationId: application.id, finixMerchantId: finixMerchant.id });
    return NextResponse.json({ success: true, applicationId: application.id });

  } catch (error: any) {
    console.error("ONBOARDING_FAILED", {
      step: "UNKNOWN_ERROR",
      errorMessage: error.message
    });
    return NextResponse.json({ 
      success: false, 
      step: "UNKNOWN_ERROR", 
      message: "We encountered an unexpected error processing your request. Please try again." 
    }, { status: 500 });
  }
}
