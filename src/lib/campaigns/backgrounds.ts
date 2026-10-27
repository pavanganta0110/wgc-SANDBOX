import type { CSSProperties } from "react";

/**
 * Background choices for a fundraising campaign's public page and live
 * donation wall, picked independently in the campaign builder/settings.
 * "image" uses the campaign's own image behind a dark overlay (falls back to
 * the default when the campaign has no image). Keys are validated server-side
 * against these lists — never trust a client-supplied value.
 */
export interface BackgroundOption {
  key: string;
  label: string;
  /** Solid colour; omitted for the "image" option. */
  color?: string;
}

export const PAGE_BACKGROUNDS: readonly BackgroundOption[] = [
  { key: "light", label: "Light gray", color: "#f8fafc" },
  { key: "cream", label: "Cream", color: "#fdf6e3" },
  { key: "navy", label: "Navy", color: "#0f172a" },
  { key: "blue", label: "Royal blue", color: "#1e3a8a" },
  { key: "green", label: "Forest green", color: "#14532d" },
  { key: "burgundy", label: "Burgundy", color: "#7f1d1d" },
  { key: "image", label: "Campaign image" },
];

export const WALL_BACKGROUNDS: readonly BackgroundOption[] = [
  { key: "navy", label: "Navy", color: "#020617" },
  { key: "black", label: "Black", color: "#000000" },
  { key: "blue", label: "Royal blue", color: "#0f2a5c" },
  { key: "green", label: "Forest green", color: "#0b3d2e" },
  { key: "burgundy", label: "Burgundy", color: "#4a0d1a" },
  { key: "purple", label: "Purple", color: "#2a1458" },
  { key: "image", label: "Campaign image" },
];

export const DEFAULT_PAGE_BACKGROUND = "light";
export const DEFAULT_WALL_BACKGROUND = "navy";

export function isValidPageBackground(key: unknown): key is string {
  return typeof key === "string" && PAGE_BACKGROUNDS.some((o) => o.key === key);
}

export function isValidWallBackground(key: unknown): key is string {
  return typeof key === "string" && WALL_BACKGROUNDS.some((o) => o.key === key);
}

function resolve(options: readonly BackgroundOption[], fallbackKey: string, key: string | null | undefined, imageUrl: string | null | undefined, overlay: string): CSSProperties {
  const fallback = options.find((o) => o.key === fallbackKey)!;
  const chosen = options.find((o) => o.key === key) ?? fallback;
  if (chosen.key === "image" && imageUrl) {
    return {
      backgroundColor: "#0f172a",
      backgroundImage: `linear-gradient(${overlay}, ${overlay}), url("${imageUrl.replace(/"/g, "%22")}")`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }
  return { backgroundColor: (chosen.key === "image" ? fallback : chosen).color };
}

export function pageBackgroundStyle(key: string | null | undefined, imageUrl: string | null | undefined): CSSProperties {
  return resolve(PAGE_BACKGROUNDS, DEFAULT_PAGE_BACKGROUND, key, imageUrl, "rgba(15, 23, 42, 0.55)");
}

export function wallBackgroundStyle(key: string | null | undefined, imageUrl: string | null | undefined): CSSProperties {
  return resolve(WALL_BACKGROUNDS, DEFAULT_WALL_BACKGROUND, key, imageUrl, "rgba(2, 6, 23, 0.72)");
}
