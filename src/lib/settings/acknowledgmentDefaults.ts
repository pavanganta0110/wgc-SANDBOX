import { formatCents } from "@/lib/format";

/**
 * IRS-style "no goods or services" / quid-pro-quo acknowledgment language,
 * shared by individual donation receipts and year-end statements. This is
 * only a starting default — every organization can fully rewrite both
 * strings from Settings (resolveAcknowledgmentSettings merges saved text
 * over these), and WGC never hardcodes tax language into the generated
 * document itself. WGC does not provide tax or legal advice; each
 * organization is responsible for ensuring its acknowledgment wording
 * complies with applicable law.
 */
export const DEFAULT_NO_GOODS_SERVICES_TEXT =
  "No goods or services were provided in exchange for this contribution.";

export const DEFAULT_GOODS_SERVICES_TEMPLATE =
  "Goods or services described as [DESCRIPTION], with an estimated fair market value of [VALUE], were provided in exchange for this contribution.";

export interface AcknowledgmentSettingsSource {
  acknowledgmentNoGoodsServicesText?: string | null;
  acknowledgmentGoodsServicesTemplate?: string | null;
}

export function resolveAcknowledgmentSettings(church: AcknowledgmentSettingsSource | null) {
  return {
    noGoodsServicesText: church?.acknowledgmentNoGoodsServicesText || DEFAULT_NO_GOODS_SERVICES_TEXT,
    goodsServicesTemplate: church?.acknowledgmentGoodsServicesTemplate || DEFAULT_GOODS_SERVICES_TEMPLATE,
  };
}

/**
 * Produces the actual acknowledgment sentence for one contribution (or, for
 * statements, one line). When a description + value were disclosed for this
 * specific contribution, uses the organization's goods/services template;
 * otherwise falls back to the plain "no goods or services" text. A
 * description without a value (or vice versa) is treated as not disclosed —
 * both must be present together to trigger the quid-pro-quo wording.
 */
export function resolveAcknowledgmentText(
  church: AcknowledgmentSettingsSource | null,
  goodsServicesDescription: string | null | undefined,
  goodsServicesFairMarketValueCents: number | null | undefined,
): string {
  const settings = resolveAcknowledgmentSettings(church);
  if (!goodsServicesDescription || goodsServicesFairMarketValueCents == null) {
    return settings.noGoodsServicesText;
  }
  return settings.goodsServicesTemplate
    .replace(/\[VALUE\]/g, formatCents(goodsServicesFairMarketValueCents))
    .replace(/\[DESCRIPTION\]/g, goodsServicesDescription);
}
