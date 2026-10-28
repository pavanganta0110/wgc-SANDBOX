export const PORTAL_BUTTON_LABELS = ["My Giving", "Donor Login", "View My Giving", "Manage My Giving"] as const;
export type PortalButtonLabel = (typeof PORTAL_BUTTON_LABELS)[number];

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** White text on dark brand colors, near-black on light ones, so the label stays readable whatever color a church picked. */
export function readableTextColor(hex: string): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return "#ffffff";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.5 ? "#0f172a" : "#ffffff";
}

/**
 * Self-contained HTML a church can paste into any website's "custom HTML" / "embed" block: one styled link to its
 * donor portal, in its brand color. Inline styles only — no script, no external files, nothing that can break or
 * track — and the link is just the portal page, never a credential.
 */
export function buildPortalButtonSnippet({ url, label, accent }: { url: string; label: string; accent: string }): string {
  const style = [
    "display:inline-block",
    "padding:12px 24px",
    `background:${accent}`,
    `color:${readableTextColor(accent)}`,
    "border-radius:8px",
    "font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif",
    "font-size:15px",
    "font-weight:600",
    "line-height:1.2",
    "text-decoration:none",
  ].join(";");
  return `<a href="${escapeAttr(url)}" style="${style};">${escapeAttr(label)}</a>`;
}
