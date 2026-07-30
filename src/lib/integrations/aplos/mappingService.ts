import { prisma } from "@/lib/prisma";
import { revalidatePurposeSelection } from "./resourceService";

/**
 * WGC Fund -> Aplos Purpose mapping (AplosPurposeMapping). A WGC Fund is
 * never mapped to an Aplos Fund directly — see funds.ts's doc comment.
 */

export class MappingValidationError extends Error {
  readonly code:
    | "FUND_NOT_FOUND"
    | "FUND_INACTIVE"
    | "CROSS_CHURCH"
    | "PURPOSE_NOT_FOUND";
  constructor(code: MappingValidationError["code"], message: string) {
    super(message);
    this.name = "MappingValidationError";
    this.code = code;
  }
}

/**
 * Saves (creates or updates) one WGC Fund -> Aplos Purpose mapping.
 * Verifies, in order:
 *   1. The fund exists AND belongs to this church (rejects a cross-church
 *      fund id outright — never trusts a client-supplied fund id blindly).
 *   2. The fund is active — an archived/inactive fund is never a valid new
 *      mapping target (existing mappings on a fund later deactivated are
 *      left alone; see listMappings, which still surfaces them for
 *      visibility rather than silently hiding history).
 *   3. The Aplos Purpose currently exists and is enabled — a real,
 *      server-side revalidation against Aplos itself (resourceService.ts),
 *      never trusting a purpose name/id typed or cached in the browser.
 * Only on all three passing does this write to the database, storing both
 * the remote Purpose id and a display-name snapshot.
 */
export async function saveFundMapping(
  churchId: string,
  wgcFundId: string,
  aplosPurposeId: number,
  isDefault: boolean
): Promise<void> {
  const fund = await prisma.fund.findUnique({ where: { id: wgcFundId }, select: { churchId: true, isActive: true } });
  if (!fund) throw new MappingValidationError("FUND_NOT_FOUND", "The selected WGC fund could not be found.");
  if (fund.churchId !== churchId) throw new MappingValidationError("CROSS_CHURCH", "That fund does not belong to this organization.");
  if (!fund.isActive) throw new MappingValidationError("FUND_INACTIVE", "Inactive funds cannot be mapped.");

  const purposeResult = await revalidatePurposeSelection(churchId, aplosPurposeId);
  if (!purposeResult.success) {
    throw new MappingValidationError("PURPOSE_NOT_FOUND", purposeResult.normalized.safeMessage);
  }

  if (isDefault) {
    // Only one mapping row may carry isDefault at a time — clear any prior
    // default before setting the new one, atomically with the upsert.
    await prisma.$transaction([
      prisma.aplosPurposeMapping.updateMany({ where: { churchId, isDefault: true }, data: { isDefault: false } }),
      prisma.aplosPurposeMapping.upsert({
        where: { churchId_wgcFundId: { churchId, wgcFundId } },
        create: { churchId, wgcFundId, aplosPurposeId: String(purposeResult.data.id), aplosPurposeName: purposeResult.data.name, isDefault: true },
        update: { aplosPurposeId: String(purposeResult.data.id), aplosPurposeName: purposeResult.data.name, isDefault: true },
      }),
    ]);
    return;
  }

  await prisma.aplosPurposeMapping.upsert({
    where: { churchId_wgcFundId: { churchId, wgcFundId } },
    create: { churchId, wgcFundId, aplosPurposeId: String(purposeResult.data.id), aplosPurposeName: purposeResult.data.name, isDefault: false },
    update: { aplosPurposeId: String(purposeResult.data.id), aplosPurposeName: purposeResult.data.name, isDefault: false },
  });
}

export async function removeFundMapping(churchId: string, wgcFundId: string): Promise<void> {
  await prisma.aplosPurposeMapping.deleteMany({ where: { churchId, wgcFundId } });
}

export interface FundMappingStatus {
  fundId: string;
  fundName: string;
  isActive: boolean;
  mapping: { aplosPurposeId: string; aplosPurposeName: string; isDefault: boolean } | null;
}

/** Every active WGC fund for this church, joined with its current mapping
 * (if any) — the exact shape the fund-mapping UI needs to show mapped vs.
 * unmapped funds without a second round trip. */
export async function listFundMappingStatus(churchId: string): Promise<FundMappingStatus[]> {
  const [funds, mappings] = await Promise.all([
    prisma.fund.findMany({ where: { churchId, isActive: true }, orderBy: { displayOrder: "asc" } }),
    prisma.aplosPurposeMapping.findMany({ where: { churchId } }),
  ]);
  const byFundId = new Map(mappings.map((m) => [m.wgcFundId, m]));

  return funds.map((f) => {
    const m = byFundId.get(f.id);
    return {
      fundId: f.id,
      fundName: f.name,
      isActive: f.isActive,
      mapping: m ? { aplosPurposeId: m.aplosPurposeId, aplosPurposeName: m.aplosPurposeName, isDefault: m.isDefault } : null,
    };
  });
}

/**
 * A church's explicit default-Purpose mapping row, if one has been chosen
 * (isDefault: true on some AplosPurposeMapping row) — distinct from
 * AplosAccountConfiguration.defaultPurposeId, which is the actual fallback
 * used at sync time (see accountConfigurationService.ts). This function is
 * used only to surface "is a default currently selected" for the mapping
 * UI; the authoritative default lives on AplosAccountConfiguration once
 * saved.
 */
export async function getDefaultMapping(churchId: string) {
  return prisma.aplosPurposeMapping.findFirst({ where: { churchId, isDefault: true } });
}
