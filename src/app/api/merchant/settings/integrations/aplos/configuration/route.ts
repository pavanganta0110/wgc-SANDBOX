import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { listFundMappingStatus } from "@/lib/integrations/aplos/mappingService";
import { computeSyncEligibility } from "@/lib/integrations/aplos/syncEligibility";

/**
 * Combined read model for the mapping/configuration UI — account
 * configuration, every active fund with its current mapping, and
 * automatic-sync eligibility, in one call. Read-only: any authenticated
 * org member may view it (matches status/route.ts's convention), same as
 * every other GET in this integration — only mutating actions require
 * canManageIntegrations.
 */
export async function GET() {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const [accountConfiguration, fundMappings, eligibility] = await Promise.all([
    prisma.aplosAccountConfiguration.findUnique({ where: { churchId: auth.churchId } }),
    listFundMappingStatus(auth.churchId),
    computeSyncEligibility(auth.churchId),
  ]);

  return NextResponse.json({
    accountConfiguration: accountConfiguration
      ? {
          depositAccountId: accountConfiguration.depositAccountId,
          depositAccountName: accountConfiguration.depositAccountName,
          processingFeeExpenseAccountId: accountConfiguration.processingFeeExpenseAccountId,
          processingFeeExpenseAccountName: accountConfiguration.processingFeeExpenseAccountName,
          defaultPurposeId: accountConfiguration.defaultPurposeId,
          defaultPurposeName: accountConfiguration.defaultPurposeName,
        }
      : null,
    fundMappings,
    mappedCount: fundMappings.filter((f) => f.mapping).length,
    unmappedCount: fundMappings.filter((f) => !f.mapping).length,
    eligibility,
  });
}
