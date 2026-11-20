/**
 * The organization name donors see: giving pages, the embedded form and
 * donation emails. It's the "Public Display Name" set under Settings > General
 * (so "Collegiate Impact" instead of the legal "Collegiate Impact Incorporated"),
 * falling back to the statement sender name, then the legal name.
 *
 * Tax documents (the receipt PDF and year-end statements) keep the legal name unless the
 * organization turns on "Use Public Display Name on PDF receipts and statements"; see legalDocOrgName.
 */
export function publicOrgName(church: {
  name: string;
  publicDisplayName?: string | null;
  statementSenderName?: string | null;
}): string {
  return church.publicDisplayName?.trim() || church.statementSenderName?.trim() || church.name;
}

/**
 * The name printed on the PDF receipt and year-end statements. The Statement Sender Name or the
 * legal name by default; the Public Display Name when the organization chose that on the Receipts settings.
 */
export function legalDocOrgName(church: {
  name: string;
  publicDisplayName?: string | null;
  statementSenderName?: string | null;
  receiptUseDisplayName?: boolean | null;
}): string {
  if (church.receiptUseDisplayName && church.publicDisplayName?.trim()) return church.publicDisplayName.trim();
  return church.statementSenderName?.trim() || church.name;
}
