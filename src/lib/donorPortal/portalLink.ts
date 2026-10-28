/** The church's donor portal page — the single place the app builds this URL for emails. */
export function donorPortalUrl(churchSlug: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.wgcpayments.com";
  return `${appUrl}/give/${churchSlug}/account`;
}

/**
 * A short "view your giving" paragraph for donor emails (receipts, statements).
 * The link is just the portal page — never a credential — so a forwarded email
 * opens nothing; the recipient still signs in with a one-time emailed code.
 */
export function donorPortalLinkParagraph(churchSlug: string | null | undefined): string {
  if (!churchSlug) return "";
  return `<p style="font-size:13px;color:#475569;">See all your giving, download statements and manage recurring gifts: <a href="${donorPortalUrl(churchSlug)}">View my giving</a>.</p>`;
}
