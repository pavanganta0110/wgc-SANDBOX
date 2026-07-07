import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { finixClient } from "@/lib/finix/client";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

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
      legal
    } = body;

    const reqHeaders = await headers();
    const ipAddress = reqHeaders.get("x-forwarded-for") || reqHeaders.get("x-real-ip") || "unknown";
    const userAgent = reqHeaders.get("user-agent") || "unknown";

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

          annualCardVolumeCents: annualCardVolume, annualAchVolumeCents: annualAchVolume, averageCardTransferAmountCents: averageCardTransferAmount, averageAchTransferAmountCents: averageAchTransferAmount,
          maxTransactionAmountCents: maxTransactionAmount, achMaxTransactionAmountCents: achMaxTransactionAmount, ecommercePercentage, cardPresentPercentage, mailOrderTelephoneOrderPercentage, businessToBusinessPercentage, businessToConsumerPercentage, otherVolumePercentage,
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
        message: "Database create failed",
        prismaCode: err.code,
        prismaMessage: err.message
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
          finixTermsUrl: process.env.NEXT_PUBLIC_FINIX_TERMS_URL || "https://finix.com/terms",
          finixPrivacyUrl: process.env.NEXT_PUBLIC_FINIX_PRIVACY_URL || "https://finix.com/privacy",
          source: "API_ONBOARDING",
        },
      });
      console.log("ONBOARDING_STEP", "LEGAL_ACCEPTANCE_CREATED");
    } catch (err: any) {
      console.error("ONBOARDING_FAILED", { step: "LEGAL_ACCEPTANCE_CREATE_FAILED", applicationId: application.id, errorMessage: err.message });
      return NextResponse.json({ success: false, step: "LEGAL_ACCEPTANCE_CREATE_FAILED", message: "Failed to save legal acceptance." }, { status: 500 });
    }

    // ==========================================
    // Finix Orchestration
    // ==========================================

    const identityPayload = {
      type: "BUSINESS",
      identity_roles: ["SELLER"],
      entity: {
        business_name: legalBusinessName, doing_business_as: doingBusinessAs, business_type: businessTypeEnum,
        business_tax_id: businessTaxId, business_phone: businessPhone, default_statement_descriptor: defaultStatementDescriptor,
        business_address: { line1: businessAddressLine1, line2: businessAddressLine2, city: businessCity, region: businessState, postal_code: businessPostalCode, country: businessCountry },
        incorporation_date: incorporationYear ? { year: incorporationYear, month: incorporationMonth, day: incorporationDay } : undefined,
        first_name: firstName, last_name: lastName, title: title, email: email, phone: phone,
        dob: { year: dobYear, month: dobMonth, day: dobDay },
        personal_address: { line1: personalAddressLine1, line2: personalAddressLine2, city: personalCity, region: personalState, postal_code: personalPostalCode, country: personalCountry },
        tax_id: taxId, principal_percentage_ownership: ownershipPercentage,
        annual_card_volume: annualCardVolume, max_transaction_amount: maxTransactionAmount, ach_max_transaction_amount: achMaxTransactionAmount, mcc,
        url: website, has_accepted_credit_cards_previously: hasAcceptedCreditCardsPreviously
      },
      additional_underwriting_data: {
        annual_ach_volume: Number(annualAchVolume), average_ach_transfer_amount: Number(averageAchTransferAmount), average_card_transfer_amount: Number(averageCardTransferAmount),
        business_description: businessDescription,
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
      let finixErrorStr = err.message;
      if (err.response && err.response.data) {
        finixErrorStr = JSON.stringify(err.response.data);
      } else if (err.details) {
        finixErrorStr = JSON.stringify(err.details);
      }
      
      console.error("ONBOARDING_FAILED", {
        step: "FINIX_IDENTITY_CREATE_FAILED",
        applicationId: application.id,
        errorMessage: finixErrorStr,
        status: err.status
      });
      return NextResponse.json({ 
        success: false, 
        step: "FINIX_IDENTITY_CREATE_FAILED", 
        message: "We could not verify your business identity. Please review your information.",
        finixError: finixErrorStr
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
              dob: { year: owner.dobYear, month: owner.dobMonth, day: owner.dobDay },
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
      console.error("ONBOARDING_FAILED", {
        step: "FINIX_BANK_INSTRUMENT_FAILED",
        applicationId: application.id,
        finixIdentityId: finixIdentity.id,
        errorMessage: err.message,
        status: err.status
      });
      await prisma.onboardingApplication.update({
        where: { id: application.id },
        data: { status: "BANK_INSTRUMENT_FAILED" },
      });
      return NextResponse.json({ 
        success: false, 
        step: "FINIX_BANK_INSTRUMENT_FAILED", 
        message: "We could not link your payout bank account. Please verify your routing and account numbers." 
      }, { status: 400 });
    }

    await prisma.onboardingApplication.update({
      where: { id: application.id },
      data: { finixPaymentInstrumentId: finixPaymentInstrument.id, bankInstrumentEnabled: finixPaymentInstrument.enabled },
    });

    // 4. Merchant
    console.log("ONBOARDING_STEP", "MERCHANT_CREATE_START");
    const processor = process.env.FINIX_PROCESSOR || "DUMMY_V1";
    let finixMerchant;
    try {
      finixMerchant = await finixClient.createMerchant(finixIdentity.id, processor);
      console.log("ONBOARDING_STEP", "MERCHANT_CREATE_SUCCESS", finixMerchant.id);
    } catch (err: any) {
      console.error("ONBOARDING_FAILED", {
        step: "FINIX_MERCHANT_CREATE_FAILED",
        applicationId: application.id,
        finixIdentityId: finixIdentity.id,
        finixPaymentInstrumentId: finixPaymentInstrument.id,
        errorMessage: err.message,
        status: err.status
      });
      await prisma.onboardingApplication.update({
        where: { id: application.id },
        data: { status: "MERCHANT_CREATION_FAILED" },
      });
      return NextResponse.json({ 
        success: false, 
        step: "FINIX_MERCHANT_CREATE_FAILED", 
        message: "We could not finalize your merchant account. Please contact support." 
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
        await resend.emails.send({
          from: process.env.EMAIL_FROM || "WGC Payments <no-reply@wgcpayments.com>",
          to: contactEmail,
          subject: "WGC Payments onboarding submitted",
          text: `Hi ${contactName},\n\nThank you for submitting your WGC Payments onboarding for ${organizationName}.\n\nYour application is now under review. Most reviews are completed within 24–48 hours.\n\nWe will notify you once your account is approved or if Finix requires additional information.\n\nThank you,\nWGC Payments`,
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
