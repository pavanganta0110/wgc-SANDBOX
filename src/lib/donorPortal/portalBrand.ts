const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_ACCENT = "#4f46e5";

/** The organization's primary brand color when it is a valid 6-digit hex, otherwise the portal default — a bad stored value can never inject CSS. */
export function resolvePortalAccent(primaryColor: string | null | undefined): string {
  return primaryColor && HEX_COLOR.test(primaryColor.trim()) ? primaryColor.trim() : DEFAULT_ACCENT;
}
