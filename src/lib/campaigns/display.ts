import type { CSSProperties } from "react";

/**
 * Size / font choices for a fundraising campaign's public page and live
 * donation wall. Stored per campaign as short keys (validated server-side via
 * parseDisplayUpdate — never trust a client-supplied value). Fonts are system
 * stacks only, so nothing extra has to load on an event screen.
 */
export interface Option {
  key: string;
  label: string;
}

export const QR_SIZES: readonly Option[] = [
  { key: "hidden", label: "Hide" },
  { key: "sm", label: "Small" },
  { key: "md", label: "Medium" },
  { key: "lg", label: "Large" },
  { key: "xl", label: "Extra large" },
];
export const IMAGE_SIZES: readonly Option[] = [
  { key: "hidden", label: "Hide" },
  { key: "sm", label: "Small" },
  { key: "md", label: "Medium" },
  { key: "lg", label: "Large" },
  { key: "xl", label: "Extra large" },
];
export const TEXT_SIZES: readonly Option[] = [
  { key: "sm", label: "Small" },
  { key: "md", label: "Medium" },
  { key: "lg", label: "Large" },
  { key: "xl", label: "Extra large" },
];
export const FONT_STYLES: readonly Option[] = [
  { key: "modern", label: "Modern" },
  { key: "classic", label: "Classic serif" },
  { key: "bold", label: "Bold display" },
  { key: "rounded", label: "Rounded" },
];

export interface DisplaySettings {
  qrSize: string;
  imageSize: string;
  textSize: string;
  fontStyle: string;
}

export const DEFAULT_DISPLAY: DisplaySettings = { qrSize: "md", imageSize: "md", textSize: "md", fontStyle: "modern" };

const QR_PX: Record<string, number> = { sm: 64, md: 96, lg: 160, xl: 240 };
const WALL_IMAGE_PX: Record<string, number> = { sm: 56, md: 80, lg: 128, xl: 176 };
const PAGE_IMAGE_HEIGHT_PX: Record<string, number> = { sm: 112, md: 192, lg: 288, xl: 384 };
const TEXT_SCALE: Record<string, number> = { sm: 0.85, md: 1, lg: 1.25, xl: 1.5 };
const FONT_STACK: Record<string, string> = {
  modern: "var(--font-inter), sans-serif",
  classic: "Georgia, 'Times New Roman', serif",
  bold: "Impact, 'Arial Black', 'Helvetica Neue', sans-serif",
  rounded: "'Trebuchet MS', 'Arial Rounded MT Bold', Verdana, sans-serif",
};

const has = (list: readonly Option[], key: unknown): key is string => typeof key === "string" && list.some((o) => o.key === key);

/** Fills any missing/unknown value with the default. Accepts a campaign row or draft. */
export function resolveDisplay(source: Partial<Record<keyof DisplaySettings, string | null | undefined>> | null | undefined): DisplaySettings {
  return {
    qrSize: has(QR_SIZES, source?.qrSize) ? source!.qrSize! : DEFAULT_DISPLAY.qrSize,
    imageSize: has(IMAGE_SIZES, source?.imageSize) ? source!.imageSize! : DEFAULT_DISPLAY.imageSize,
    textSize: has(TEXT_SIZES, source?.textSize) ? source!.textSize! : DEFAULT_DISPLAY.textSize,
    fontStyle: has(FONT_STYLES, source?.fontStyle) ? source!.fontStyle! : DEFAULT_DISPLAY.fontStyle,
  };
}

/** Validates the display fields of a create/update request body. */
export function parseDisplayUpdate(body: Record<string, unknown>): { error?: string; data: Partial<DisplaySettings> } {
  const data: Partial<DisplaySettings> = {};
  const fields: [keyof DisplaySettings, readonly Option[], string][] = [
    ["qrSize", QR_SIZES, "QR code size"],
    ["imageSize", IMAGE_SIZES, "image size"],
    ["textSize", TEXT_SIZES, "text size"],
    ["fontStyle", FONT_STYLES, "font style"],
  ];
  for (const [field, list, label] of fields) {
    if (body[field] === undefined) continue;
    if (!has(list, body[field])) return { error: `Invalid ${label}`, data: {} };
    data[field] = body[field] as string;
  }
  return { data };
}

export const qrPx = (key: string, scale = 1) => Math.round((QR_PX[key] ?? QR_PX.md) * scale);
export const wallImagePx = (key: string, scale = 1) => Math.round((WALL_IMAGE_PX[key] ?? WALL_IMAGE_PX.md) * scale);
export const pageImageHeightPx = (key: string, scale = 1) => Math.round((PAGE_IMAGE_HEIGHT_PX[key] ?? PAGE_IMAGE_HEIGHT_PX.md) * scale);

/** CSS `zoom` multiplier for text blocks (supported by all current browsers). */
export const textZoomStyle = (key: string): CSSProperties | undefined => {
  const z = TEXT_SCALE[key] ?? 1;
  return z === 1 ? undefined : { zoom: z };
};

/** Sets --campaign-font; globals.css applies it (incl. to headings, which have a global font override). */
export const fontVarStyle = (key: string): CSSProperties => ({ ["--campaign-font" as string]: FONT_STACK[key] ?? FONT_STACK.modern });
