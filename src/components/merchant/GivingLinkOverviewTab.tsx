import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import { titleCase, Row } from "@/components/merchant/RefundDetailPrimitives";
import {
  parseDonorFieldSettings,
  parseAllowedPaymentMethods,
  parseAllowedFrequencies,
  parseReceiptSettings,
  parseBrandingSettings,
  DONOR_FIELDS,
} from "@/lib/givingLinks/types";

const DONOR_FIELD_LABELS: Record<string, string> = {
  firstName: "First Name",
  lastName: "Last Name",
  email: "Email",
  phone: "Phone",
  street: "Street Address",
  apartment: "Apartment/Suite",
  city: "City",
  state: "State",
  postalCode: "Postal Code",
  country: "Country",
  donorNote: "Donor Note",
  anonymousDonation: "Anonymous Donation",
  companyName: "Company/Organization Name",
};

export default async function GivingLinkOverviewTab({
  link,
}: {
  link: NonNullable<Awaited<ReturnType<typeof prisma.givingLink.findFirst>>>;
}) {
  const church = await prisma.church.findUnique({ where: { id: link.churchId } });

  const donorFieldSettings = parseDonorFieldSettings(link.donorFieldSettingsJson);
  const allowedPaymentMethods = parseAllowedPaymentMethods(link.allowedPaymentMethodsJson);
  const allowedFrequencies = parseAllowedFrequencies(link.allowedFrequenciesJson);
  const receiptSettings = parseReceiptSettings(link.receiptSettingsJson);
  const branding = parseBrandingSettings(link.brandingSettingsJson);
  const suggestedAmounts = Array.isArray(link.suggestedAmountsJson) ? (link.suggestedAmountsJson as number[]) : [];

  const tags: Record<string, string> = {
    source: "wgc_giving_link",
    givingLinkId: link.id,
    churchId: link.churchId,
    ...(link.fundName ? { fundId: link.fundName } : {}),
  };

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      {/* Left */}
      <div className="lg:col-span-2 space-y-6">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h3 className="text-sm font-bold text-slate-900 mb-4">Giving Information</h3>
          <Row label="Public Title" value={link.publicTitle} />
          <Row label="Description" value={link.description || "—"} />
          <Row label="Amount Type" value={link.amountType === "VARIABLE" ? "Variable Amount" : "Fixed Amount"} />
          {link.amountType === "FIXED" ? (
            <Row label="Amount" value={link.fixedAmountCents != null ? formatCents(link.fixedAmountCents) : "—"} />
          ) : (
            <>
              <Row label="Minimum Amount" value={link.minAmountCents != null ? formatCents(link.minAmountCents) : "—"} />
              <Row label="Maximum Amount" value={link.maxAmountCents != null ? formatCents(link.maxAmountCents) : "—"} />
              <Row label="Suggested Amounts" value={suggestedAmounts.map((c) => formatCents(c)).join(", ") || "—"} />
            </>
          )}
          <Row label="Fund / Designation" value={link.fundName || "—"} />
          <Row label="Recurring Giving" value={link.recurringEnabled ? allowedFrequencies.map(titleCase).join(", ") : "Not enabled"} />
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-100">
          <div className="px-6 py-4">
            <h3 className="text-sm font-bold text-slate-900">Link Settings</h3>
          </div>
          <div className="px-6 py-4">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Donor Details</h4>
            {DONOR_FIELDS.map((f) => (
              <Row key={f} label={DONOR_FIELD_LABELS[f]} value={titleCase(donorFieldSettings[f])} />
            ))}
          </div>
          <div className="px-6 py-4">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Allowed Payment Methods</h4>
            <Row label="Methods" value={allowedPaymentMethods.map(titleCase).join(", ")} />
          </div>
          <div className="px-6 py-4">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">URLs</h4>
            <Row label="Success Return URL" value={link.successReturnUrl || "Default WGC success page"} />
            <Row label="Failure Return URL" value={link.failureReturnUrl || "Default WGC failure page"} />
            <Row label="Cancel Return URL" value={link.cancelReturnUrl || "Default WGC cancel page"} />
          </div>
          <div className="px-6 py-4">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Receipt Settings</h4>
            <Row label="Send Automatically" value={receiptSettings.sendAutomatically ? "Yes" : "No"} />
            <Row label="Sender Name" value={receiptSettings.senderName || "—"} />
            <Row label="Reply-To" value={receiptSettings.replyTo || "—"} />
            <Row label="Subject" value={receiptSettings.subject || "—"} />
            <Row label="Tax-Deductibility Wording" value={receiptSettings.includeTaxLanguage ? "Included" : "Not included"} />
          </div>
          <div className="px-6 py-4">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Fee-Cover Settings</h4>
            <Row label="Allow Donor to Cover Fees" value={link.feeCoverEnabled ? "Yes" : "No"} />
            <Row label="Default" value={link.feeCoverDefaultOn ? "Checked" : "Unchecked"} />
          </div>
          <div className="px-6 py-4">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Advanced Settings</h4>
            <Row label="Statement Descriptor" value={link.statementDescriptor || "—"} />
            <Row label="Internal Note" value={link.internalNote || "—"} />
            <Row label="Reference Number" value={link.referenceNumber || "—"} />
          </div>
        </div>
      </div>

      {/* Right */}
      <div className="space-y-6">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h3 className="text-sm font-bold text-slate-900 mb-4">Customization</h3>
          <Row label="Header Color" value={<ColorSwatch color={branding.light.headerBackground} />} />
          <Row label="Button Color" value={<ColorSwatch color={branding.light.buttonBackground} />} />
          <Row label="Button Text Color" value={<ColorSwatch color={branding.light.buttonText} />} />
          <Row label="Background Color" value={<ColorSwatch color={branding.light.pageBackground} />} />
          <Row label="Logo" value={branding.light.logoUrl ? "Custom" : "WGC Default"} />
          <Row label="Dark Mode Header" value={<ColorSwatch color={branding.dark.headerBackground} />} />
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h3 className="text-sm font-bold text-slate-900 mb-4">Related Resources</h3>
          <Row label="Organization" value={church?.name || "—"} />
          <Row label="Fund / Campaign" value={link.fundName || "—"} />
          <Row label="Created By" value={link.createdByUserId || "—"} />
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h3 className="text-sm font-bold text-slate-900 mb-4">Tags</h3>
          {Object.entries(tags).map(([key, value]) => (
            <Row key={key} label={titleCase(key)} value={value} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ColorSwatch({ color }: { color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-3.5 h-3.5 rounded-full border border-slate-200" style={{ backgroundColor: color }} />
      {color}
    </span>
  );
}
