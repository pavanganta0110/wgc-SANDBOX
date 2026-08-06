import { prisma } from "@/lib/prisma";

/**
 * Whether a church's configuration is complete enough to allow enabling
 * automatic synchronization — per the approved spec's exact eligibility
 * rule. This module only computes eligibility from already-persisted
 * data; it does not itself call Aplos (see accountConfigurationService.ts's
 * revalidateSavedConfiguration for the live-resource re-check the
 * "Refresh resources" action performs, which feeds into this via the
 * connection's own status/lastErrorAt fields).
 */

export interface SyncEligibilityResult {
  eligible: boolean;
  reasons: string[];
}

export async function computeSyncEligibility(churchId: string): Promise<SyncEligibilityResult> {
  const reasons: string[] = [];

  const connection = await prisma.aplosConnection.findUnique({ where: { churchId } });
  if (!connection || connection.status !== "CONNECTED") {
    reasons.push("Aplos is not connected and verified.");
  }

  const config = await prisma.aplosAccountConfiguration.findUnique({ where: { churchId } });
  if (!config) {
    reasons.push("Deposit account, processing-fee expense account, and default Purpose are not configured.");
  }

  const [activeFundCount, mappedFundCount] = await Promise.all([
    prisma.fund.count({ where: { churchId, isActive: true } }),
    prisma.aplosPurposeMapping.count({ where: { churchId } }),
  ]);

  // Every active fund must be mapped OR an explicit default Purpose must
  // exist (config.defaultPurposeId, set only via a deliberate save — see
  // accountConfigurationService.ts) — never inferred/assumed.
  const hasDefaultPurpose = !!config?.defaultPurposeId;
  if (!hasDefaultPurpose && mappedFundCount < activeFundCount) {
    reasons.push(
      `${activeFundCount - mappedFundCount} active fund(s) are not mapped to an Aplos Purpose, and no default Purpose is configured.`
    );
  }

  // A recent connection-level error (e.g. from a "Refresh resources" or
  // Test Connection failure) blocks eligibility until resolved.
  if (connection?.lastErrorAt && (!connection.lastConnectionTestAt || connection.lastErrorAt > connection.lastConnectionTestAt)) {
    reasons.push("The most recent connection check reported an error — resolve it before enabling automatic sync.");
  }

  return { eligible: reasons.length === 0, reasons };
}
