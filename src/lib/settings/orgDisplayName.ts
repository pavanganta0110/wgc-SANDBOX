/**
 * The organization name donors see: giving pages, the embedded form and
 * donation emails. It's the "Public Display Name" set under Settings > General
 * (so "Collegiate Impact" instead of the legal "Collegiate Impact Incorporated"),
 * falling back to the statement sender name, then the legal name.
 *
 * Tax documents (the receipt PDF and year-end statements) keep the legal name.
 */
export function publicOrgName(church: {
  name: string;
  publicDisplayName?: string | null;
  statementSenderName?: string | null;
}): string {
  return church.publicDisplayName?.trim() || church.statementSenderName?.trim() || church.name;
}
