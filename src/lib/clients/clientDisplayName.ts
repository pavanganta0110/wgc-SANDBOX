/** Computes Client.displayName from the individual/organization fields at
 * write time — never recomputed on read, matching this field's schema
 * comment. Falls back sensibly so a client is never displayed blank. */
export function computeClientDisplayName(params: {
  clientType: "INDIVIDUAL" | "ORGANIZATION";
  firstName?: string | null;
  lastName?: string | null;
  organizationName?: string | null;
}): string {
  const { clientType, firstName, lastName, organizationName } = params;
  if (clientType === "ORGANIZATION") {
    return organizationName?.trim() || [firstName, lastName].filter(Boolean).join(" ").trim() || "Unnamed Client";
  }
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  return name || organizationName?.trim() || "Unnamed Client";
}
