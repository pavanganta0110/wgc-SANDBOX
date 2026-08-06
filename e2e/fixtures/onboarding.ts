import { randomSuffix } from "./db";

/**
 * A fully-valid /api/onboarding request body. Field names mirror exactly
 * what src/app/api/onboarding/route.ts destructures from the request —
 * driving the real API the /start multi-step form itself submits to,
 * rather than clicking through ~40 individual form fields across several
 * wizard tabs via brittle CSS selectors (the resulting Finix identity /
 * bank instrument / merchant creation calls are still exercised for real,
 * just routed at the finixClient's HTTP layer to the local fake Finix
 * server configured via FINIX_BASE_URL in playwright.config.ts).
 */
export function buildOnboardingPayload(overrides: {
  organizationName: string;
  contactEmail: string;
}) {
  const suffix = randomSuffix();
  return {
    organizationName: overrides.organizationName,
    organizationType: "Nonprofit",
    contactName: "E2E Test Contact",
    contactEmail: overrides.contactEmail,
    contactPhone: "5555550100",
    website: "https://example.org",

    legalBusinessName: overrides.organizationName,
    doingBusinessAs: overrides.organizationName,
    businessTaxId: "123456789",
    businessPhone: "5555550100",
    businessAddressLine1: "123 Test St",
    businessAddressLine2: "",
    businessCity: "Austin",
    businessState: "TX",
    businessPostalCode: "78701",
    businessCountry: "USA",
    businessDescription: "E2E test nonprofit organization for automated testing.",
    mcc: "8398",
    defaultStatementDescriptor: `E2E ${suffix}`,

    annualCardVolume: "100000",
    annualAchVolume: "50000",
    averageCardTransferAmount: "100",
    averageAchTransferAmount: "100",
    maxTransactionAmount: "5000",
    achMaxTransactionAmount: "5000",
    // Int? columns on OnboardingApplication (principalDobYear,
    // incorporationYear, *Percentage, etc.) — must be sent as numbers, not
    // strings, or prisma.onboardingApplication.create() throws
    // "Expected Int or Null, provided String."
    ecommercePercentage: 100,
    cardPresentPercentage: 0,
    mailOrderTelephoneOrderPercentage: 0,
    businessToBusinessPercentage: 0,
    businessToConsumerPercentage: 100,
    otherVolumePercentage: 0,
    refundPolicy: "Standard 30-day refund policy.",
    hasAcceptedCreditCardsPreviously: false,

    firstName: "Jamie",
    lastName: "Owner",
    title: "Executive Director",
    email: overrides.contactEmail,
    phone: "5555550100",
    dobYear: 1985,
    dobMonth: 6,
    dobDay: 15,
    ownershipPercentage: 100,
    personalAddressLine1: "123 Test St",
    personalAddressLine2: "",
    personalCity: "Austin",
    personalState: "TX",
    personalPostalCode: "78701",
    personalCountry: "USA",
    taxId: "123456789",

    incorporationYear: 2015,
    incorporationMonth: 1,
    incorporationDay: 1,

    associatedOwners: [],

    accountHolderName: overrides.organizationName,
    accountType: "CHECKING",
    routingNumber: "021000021",
    accountNumber: "1234567890",
    bankCountry: "USA",
    currency: "USD",

    legal: {
      wgcTerms: true,
      wgcFees: true,
      wgcPrivacy: true,
      finixTerms: true,
      finixPrivacy: true,
    },
  };
}
