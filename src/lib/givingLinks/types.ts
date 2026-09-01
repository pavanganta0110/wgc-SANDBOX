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
  // Optional video shown on the success screen after a donation completes.
  // Stored as the full URL a merchant pastes in (YouTube, Vimeo, TikTok,
  // Instagram, Facebook, or a direct .mp4/.webm/.ogg file) —
  // resolveThankYouVideoEmbed() below is the only thing that ever turns
  // this into an iframe/video src, and it only recognizes those specific
  // platforms' own real video-URL shapes, so a merchant pasting an
  // unrelated or malicious URL simply results in no video rendering,
  // never an arbitrary embedded origin.
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
// anything else (including a non-YouTube URL).
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

export type ThankYouVideoEmbed =
  | { kind: "iframe"; src: string; aspect: "16/9" | "9/16" }
  | { kind: "video"; src: string; aspect: "16/9" };

// Recognizes a real video URL from one of a fixed set of platforms
// (YouTube, Vimeo, TikTok, Instagram, Facebook) or a direct video file,
// and turns it into the exact iframe/video src to render — never the raw
// merchant-pasted URL. Anything that doesn't match one of these known
// shapes returns null, so a merchant pasting an unrelated or malicious
// link simply results in no video appearing, never an arbitrary embedded
// origin on the donation success page.
export function resolveThankYouVideoEmbed(rawUrl: string): ThankYouVideoEmbed | null {
  if (!rawUrl) return null;
  let u: URL;
  try {
    u = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");

  // Direct video file — native <video>, not an iframe, so there's no
  // embedded-page surface at all regardless of the host.
  if (/\.(mp4|webm|ogg)$/i.test(u.pathname)) {
    return { kind: "video", src: u.toString(), aspect: "16/9" };
  }

  const youtubeId = parseYouTubeVideoId(rawUrl);
  if (youtubeId) {
    // autoplay=1 only actually autoplays if mute=1 is also set — every
    // major browser blocks audible autoplay without a prior user gesture.
    // The donor can unmute via the player's own volume control.
    return { kind: "iframe", src: `https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&mute=1`, aspect: "16/9" };
  }

  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const match = u.pathname.match(/(\d{6,})/);
    if (match) return { kind: "iframe", src: `https://player.vimeo.com/video/${match[1]}?autoplay=1&muted=1`, aspect: "16/9" };
    return null;
  }

  if (host === "tiktok.com") {
    // TikTok's embed iframe has no documented/reliable autoplay param —
    // stays click-to-play.
    const match = u.pathname.match(/\/video\/(\d+)/);
    if (match) return { kind: "iframe", src: `https://www.tiktok.com/embed/v2/${match[1]}`, aspect: "9/16" };
    return null;
  }

  if (host === "instagram.com") {
    // Instagram's basic embed iframe has no autoplay support at all —
    // stays click-to-play.
    const match = u.pathname.match(/^\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
    if (match) return { kind: "iframe", src: `https://www.instagram.com/${match[1]}/${match[2]}/embed`, aspect: "9/16" };
    return null;
  }

  if (host === "facebook.com" || host === "fb.watch") {
    // Facebook's own video plugin — it validates href server-side against
    // a real Facebook-hosted video, so this never becomes a generic
    // "embed any URL" primitive despite taking a URL as a parameter.
    return {
      kind: "iframe",
      src: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(u.toString())}&show_text=false&autoplay=true&mute=1`,
      aspect: "16/9",
    };
  }

  return null;
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
