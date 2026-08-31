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
  phone: "REQUIRED",
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
  // Optional YouTube video shown on the success screen after a donation
  // completes. Stored as the full URL a merchant pastes in (watch, share,
  // or shorts link) — parseYouTubeVideoId() below normalizes it to a video
  // ID before ever building an iframe src, so only a real youtube.com/
  // youtu.be URL can ever end up embedded (never an arbitrary domain).
  thankYouVideoUrl: string;
  supportEmail: string;
  showPoweredByWgc?: boolean;
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
  thankYouVideoUrl: "",
  supportEmail: "",
  showPoweredByWgc: true,
};

// Accepts youtube.com/watch?v=, youtu.be/, youtube.com/shorts/, and
// youtube.com/embed/ URLs; returns the bare 11-char video ID, or null for
// anything else (including a non-YouTube URL) — the only value ever
// allowed into an iframe src, so a merchant pasting an arbitrary URL can
// never result in embedding an untrusted origin.
export function parseYouTubeVideoId(url: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      return /^[\w-]{11}$/.test(id) ? id : null;
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      if (u.pathname === "/watch") {
        const id = u.searchParams.get("v");
        return id && /^[\w-]{11}$/.test(id) ? id : null;
      }
      const shortsMatch = u.pathname.match(/^\/(?:shorts|embed)\/([\w-]{11})/);
      if (shortsMatch) return shortsMatch[1];
    }
    return null;
  } catch {
    return null;
  }
}

export function parseBrandingSettings(json: unknown): BrandingSettings {
  if (!json || typeof json !== "object") return DEFAULT_BRANDING_SETTINGS;
  const parsed = json as Partial<BrandingSettings>;
  const showPoweredByWgc = typeof parsed.showPoweredByWgc === "boolean" 
    ? parsed.showPoweredByWgc 
    : !(parsed.hideFooter ?? false);
  return {
    ...DEFAULT_BRANDING_SETTINGS,
    ...parsed,
    light: { ...DEFAULT_LIGHT_BRANDING, ...(parsed.light ?? {}) },
    dark: { ...DEFAULT_DARK_BRANDING, ...(parsed.dark ?? {}) },
    showPoweredByWgc,
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
