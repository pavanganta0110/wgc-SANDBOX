export const DONOR_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "street",
  "apartment",
  "city",
  "state",
  "postalCode",
  "country",
  "donorNote",
  "anonymousDonation",
  "companyName",
] as const;

export type DonorFieldKey = (typeof DONOR_FIELDS)[number];
export type DonorFieldVisibility = "REQUIRED" | "OPTIONAL" | "HIDDEN";
export type DonorFieldSettings = Record<DonorFieldKey, DonorFieldVisibility>;

export const DEFAULT_DONOR_FIELD_SETTINGS: DonorFieldSettings = {
  firstName: "REQUIRED",
  lastName: "REQUIRED",
  email: "REQUIRED",
  phone: "OPTIONAL",
  street: "HIDDEN",
  apartment: "HIDDEN",
  city: "HIDDEN",
  state: "HIDDEN",
  postalCode: "HIDDEN",
  country: "HIDDEN",
  donorNote: "OPTIONAL",
  anonymousDonation: "OPTIONAL",
  companyName: "HIDDEN",
};

export function parseDonorFieldSettings(json: unknown): DonorFieldSettings {
  if (!json || typeof json !== "object") return DEFAULT_DONOR_FIELD_SETTINGS;
  const parsed = json as Partial<DonorFieldSettings>;
  const result = { ...DEFAULT_DONOR_FIELD_SETTINGS };
  for (const key of DONOR_FIELDS) {
    const v = parsed[key];
    if (v === "REQUIRED" || v === "OPTIONAL" || v === "HIDDEN") result[key] = v;
  }
  return result;
}

export const PAYMENT_METHODS = ["CARD", "BANK", "APPLE_PAY", "GOOGLE_PAY"] as const;
export type PaymentMethodKey = (typeof PAYMENT_METHODS)[number];

export function parseAllowedPaymentMethods(json: unknown): PaymentMethodKey[] {
  if (!Array.isArray(json)) return ["CARD"];
  const valid = json.filter((m): m is PaymentMethodKey => PAYMENT_METHODS.includes(m));
  return valid.length > 0 ? valid : ["CARD"];
}

export const FREQUENCIES = ["WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"] as const;
export type FrequencyKey = (typeof FREQUENCIES)[number];

export function parseAllowedFrequencies(json: unknown): FrequencyKey[] {
  if (!Array.isArray(json)) return ["MONTHLY"];
  const valid = json.filter((f): f is FrequencyKey => FREQUENCIES.includes(f));
  return valid.length > 0 ? valid : ["MONTHLY"];
}

export interface ReceiptSettings {
  sendAutomatically: boolean;
  senderName: string;
  replyTo: string;
  subject: string;
  customMessage: string;
  includeTaxLanguage: boolean;
}

export const DEFAULT_RECEIPT_SETTINGS: ReceiptSettings = {
  sendAutomatically: true,
  senderName: "",
  replyTo: "",
  subject: "",
  customMessage: "",
  includeTaxLanguage: false,
};

export function parseReceiptSettings(json: unknown): ReceiptSettings {
  if (!json || typeof json !== "object") return DEFAULT_RECEIPT_SETTINGS;
  return { ...DEFAULT_RECEIPT_SETTINGS, ...(json as Partial<ReceiptSettings>) };
}

export interface BrandingModeSettings {
  logoUrl: string;
  headerBackground: string;
  pageBackground: string;
  buttonBackground: string;
  buttonText: string;
  headingColor: string;
  bodyTextColor: string;
  linkColor: string;
  borderColor: string;
}

export interface BrandingSettings {
  light: BrandingModeSettings;
  dark: BrandingModeSettings;
  campaignImageUrl: string;
  hideFooter: boolean;
  hideChurchAddress: boolean;
  hideContactInfo: boolean;
  thankYouMessage: string;
  supportEmail: string;
}

export const DEFAULT_LIGHT_BRANDING: BrandingModeSettings = {
  logoUrl: "",
  headerBackground: "#ffffff",
  pageBackground: "#f8fafc",
  buttonBackground: "#eab308",
  buttonText: "#0f172a",
  headingColor: "#0f172a",
  bodyTextColor: "#475569",
  linkColor: "#2563eb",
  borderColor: "#e2e8f0",
};

export const DEFAULT_DARK_BRANDING: BrandingModeSettings = {
  logoUrl: "",
  headerBackground: "#0f172a",
  pageBackground: "#020617",
  buttonBackground: "#eab308",
  buttonText: "#0f172a",
  headingColor: "#f8fafc",
  bodyTextColor: "#cbd5e1",
  linkColor: "#60a5fa",
  borderColor: "#1e293b",
};

export const DEFAULT_BRANDING_SETTINGS: BrandingSettings = {
  light: DEFAULT_LIGHT_BRANDING,
  dark: DEFAULT_DARK_BRANDING,
  campaignImageUrl: "",
  hideFooter: false,
  hideChurchAddress: false,
  hideContactInfo: false,
  thankYouMessage: "",
  supportEmail: "",
};

export function parseBrandingSettings(json: unknown): BrandingSettings {
  if (!json || typeof json !== "object") return DEFAULT_BRANDING_SETTINGS;
  const parsed = json as Partial<BrandingSettings>;
  return {
    ...DEFAULT_BRANDING_SETTINGS,
    ...parsed,
    light: { ...DEFAULT_LIGHT_BRANDING, ...(parsed.light ?? {}) },
    dark: { ...DEFAULT_DARK_BRANDING, ...(parsed.dark ?? {}) },
  };
}
export function resolveGivingPageLogo({
  givingPageLogoUrl,
  organizationLogoUrl,
  fallbackLogoUrl = "/wgc-logo.png"
}: {
  givingPageLogoUrl?: string | null;
  organizationLogoUrl?: string | null;
  fallbackLogoUrl?: string | null;
}) {
  if (givingPageLogoUrl && givingPageLogoUrl.trim() !== "") {
    return givingPageLogoUrl;
  }
  if (organizationLogoUrl && organizationLogoUrl.trim() !== "") {
    return organizationLogoUrl;
  }
  return fallbackLogoUrl || "/wgc-logo.png";
}
