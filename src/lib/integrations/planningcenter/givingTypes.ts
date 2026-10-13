/**
 * Shapes shared between the Giving-setup service, its API routes and the
 * settings UI. Pure types and one pure function — safe to import from a
 * client component (no server-only imports here).
 */

/** `OK` = Giving reachable; `DENIED` = 403 (user lacks Giving permission);
 * `NOT_ENABLED` = 404 (Giving doesn't appear to be turned on for the org). */
export type PcoGivingAccess = "OK" | "DENIED" | "NOT_ENABLED";

export type MappingHealth = "OK" | "MISSING" | "HIDDEN";

export interface GivingSetupFundRow {
  fundId: string;
  name: string;
  mapping: { pcoFundId: string; pcoFundName: string; health: MappingHealth } | null;
  /** Exact (case-insensitive) name match in Planning Center, offered only for unmapped funds. */
  suggestion: { pcoFundId: string; pcoFundName: string } | null;
}

export interface GivingSetupState {
  pcoAccess: PcoGivingAccess;
  organizationName: string | null;
  canWriteGiving: boolean | null;
  paymentSource: {
    state: "READY" | "ARCHIVED" | "MISSING";
    name: string;
    /** A source with the WGC name already exists in Planning Center and will be reused. */
    existingWillBeReused: boolean;
  };
  defaultFund: { pcoFundId: string; pcoFundName: string; health: MappingHealth } | null;
  /** Planning Center's own default fund, offered as the starting choice. */
  suggestedDefaultFund: { pcoFundId: string; pcoFundName: string } | null;
  funds: GivingSetupFundRow[];
  pcoFunds: Array<{ id: string; name: string; visibility: string; isDefault: boolean; usable: boolean }>;
  readiness: GivingReadiness;
}

export interface GivingReadiness {
  ready: boolean;
  /** Everything blocking readiness, in plain language. */
  reasons: string[];
  /** Non-blocking things worth knowing (e.g. unmapped funds will use the default fund). */
  notes: string[];
}

export interface ReadinessInput {
  connectionHealthy: boolean;
  organizationMatches: boolean;
  canReadGiving: boolean | null;
  canWriteGiving: boolean | null;
  paymentSource: "READY" | "ARCHIVED" | "MISSING";
  defaultFund: { name: string; health: MappingHealth } | null;
  funds: Array<{ name: string; mapping: { health: MappingHealth } | null }>;
}

/**
 * The single definition of "is this church's Giving setup complete enough to
 * sync gifts". Used with live Planning Center data by the setup screen, and
 * with stored data (no network) by the sync engine in a later phase — one
 * function so the two can never disagree about what "ready" means.
 */
export function evaluateGivingReadiness(input: ReadinessInput): GivingReadiness {
  const reasons: string[] = [];
  const notes: string[] = [];

  if (!input.connectionHealthy) reasons.push("Planning Center isn't connected, or the connection needs to be reconnected.");
  if (!input.organizationMatches) reasons.push("This setup belongs to a different Planning Center organization. Run the setup again.");
  if (input.canReadGiving === false) reasons.push("The connected Planning Center user can't access Giving.");
  if (input.canWriteGiving === false) {
    reasons.push("The connected Planning Center user can't make changes in Giving. Reconnect with a Finance Administrator account.");
  } else if (input.canWriteGiving !== true) {
    reasons.push("Write access to Planning Center Giving hasn't been confirmed yet. Set up the payment source to check it.");
  }

  if (input.paymentSource === "MISSING") reasons.push("The WGC payment source hasn't been set up in Planning Center.");
  if (input.paymentSource === "ARCHIVED") reasons.push("The WGC payment source is archived in Planning Center. Set it up again to reactivate it.");

  if (!input.defaultFund) {
    reasons.push("Choose a default Planning Center fund for gifts that aren't mapped.");
  } else if (input.defaultFund.health !== "OK") {
    reasons.push(`The default fund “${input.defaultFund.name}” ${input.defaultFund.health === "MISSING" ? "no longer exists" : "can't receive gifts"} in Planning Center. Choose another.`);
  }

  const broken = input.funds.filter((f) => f.mapping && f.mapping.health !== "OK");
  for (const f of broken) {
    reasons.push(`“${f.name}” is mapped to a Planning Center fund that ${f.mapping!.health === "MISSING" ? "no longer exists" : "can't receive gifts"}. Choose another.`);
  }

  const unmapped = input.funds.filter((f) => !f.mapping);
  if (unmapped.length > 0 && input.defaultFund && input.defaultFund.health === "OK") {
    notes.push(
      `${unmapped.length} fund${unmapped.length === 1 ? "" : "s"} ${unmapped.length === 1 ? "isn't" : "aren't"} mapped, so gifts to ${unmapped.length === 1 ? "it" : "them"} will be recorded in “${input.defaultFund.name}”.`
    );
  }

  return { ready: reasons.length === 0, reasons, notes };
}
