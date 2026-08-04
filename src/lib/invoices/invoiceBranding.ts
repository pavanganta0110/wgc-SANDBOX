import { prisma } from "@/lib/prisma";

/**
 * The full set of branding fields used consistently across every invoice
 * output: builder live preview, before-send preview, email, public payment
 * page, PDF, and QR-code landing. Every one of those surfaces must render
 * from this exact shape (or an InvoiceRevision snapshot of it, once an
 * invoice has been sent) — never a separately duplicated branding lookup,
 * which is what "Use shared reusable branding components" and
 * "Consistency across outputs" require.
 */
export interface InvoiceBrandingSnapshot {
  logoUrl: string | null;
  organizationDisplayName: string;
  organizationLegalName: string | null;
  organizationAddress: string | null;
  organizationPhone: string | null;
  organizationSupportEmail: string | null;
  organizationWebsite: string | null;
  taxRegistrationNumber: string | null;
  invoiceNumberPrefix: string;
  templateName: string;
  accentColor: string;
  footerMessage: string | null;
  thankYouMessage: string | null;
  defaultMemo: string | null;
  defaultTerms: string | null;
  defaultPaymentInstructions: string | null;
  replyToEmail: string | null;
  showWgcBranding: boolean;
}

const DEFAULT_ACCENT_COLOR = "#1d4ed8";

/**
 * Resolves the current branding for a church — used for live preview and
 * for anything not yet sent. Once an invoice is actually sent, its
 * InvoiceRevision snapshot (captured at send time) is the source of truth
 * instead, per "Later changes to the merchant's logo or branding must not
 * silently change previously issued invoices."
 *
 * Logo fallback: if no invoice-specific or organization logo is set,
 * `logoUrl` is null and every renderer must fall back to a professional
 * text header using organizationDisplayName — never a broken image, never
 * another merchant's logo, never a fake placeholder logo, per the approved
 * spec's "Logo fallback behavior."
 */
export async function resolveInvoiceBranding(churchId: string): Promise<InvoiceBrandingSnapshot> {
  const [settings, church] = await Promise.all([
    prisma.invoiceSettings.findUnique({ where: { churchId } }),
    prisma.church.findUnique({ where: { id: churchId }, select: { name: true, logoUrl: true, primaryContactEmail: true } }),
  ]);

  const organizationDisplayName = settings?.organizationDisplayName?.trim() || church?.name?.trim() || "Your Organization";

  return {
    logoUrl: settings?.invoiceLogoUrl || church?.logoUrl || null,
    organizationDisplayName,
    organizationLegalName: settings?.organizationLegalName || null,
    organizationAddress: settings?.organizationAddress || null,
    organizationPhone: settings?.organizationPhone || null,
    organizationSupportEmail: settings?.organizationSupportEmail || church?.primaryContactEmail || null,
    organizationWebsite: settings?.organizationWebsite || null,
    taxRegistrationNumber: settings?.taxRegistrationNumber || null,
    invoiceNumberPrefix: settings?.invoiceNumberPrefix || "INV-",
    templateName: settings?.defaultTemplateName || "CLASSIC",
    accentColor: settings?.accentColor || DEFAULT_ACCENT_COLOR,
    footerMessage: settings?.footerMessage || null,
    thankYouMessage: settings?.thankYouMessage || null,
    defaultMemo: settings?.defaultMemo || null,
    defaultTerms: settings?.defaultTerms || null,
    defaultPaymentInstructions: settings?.defaultPaymentInstructions || null,
    replyToEmail: settings?.replyToEmail || settings?.organizationSupportEmail || church?.primaryContactEmail || null,
    showWgcBranding: settings?.showWgcBranding ?? true,
  };
}

/** Applies a specific invoice's own template/accent-color overrides (set
 * per-invoice on top of the church-wide defaults) to a resolved branding
 * snapshot — used when building the snapshot for a specific invoice at
 * send time. */
export function applyInvoiceOverrides(
  branding: InvoiceBrandingSnapshot,
  invoice: { templateName: string; accentColor: string | null }
): InvoiceBrandingSnapshot {
  return {
    ...branding,
    templateName: invoice.templateName || branding.templateName,
    accentColor: invoice.accentColor || branding.accentColor,
  };
}

export const INVOICE_TEMPLATES = ["CLASSIC", "MODERN", "MINIMAL", "PROFESSIONAL"] as const;
export type InvoiceTemplateName = (typeof INVOICE_TEMPLATES)[number];
