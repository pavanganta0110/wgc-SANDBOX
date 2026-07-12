import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import GivingLinkBuilderForm from "@/components/merchant/GivingLinkBuilderForm";
import { parseDonorFieldSettings, parseAllowedPaymentMethods, parseAllowedFrequencies, parseReceiptSettings, parseBrandingSettings } from "@/lib/givingLinks/types";

export default async function EditGivingLinkPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  const churchId = session!.churchId!;
  const { id } = await params;

  const [link, church, pricing] = await Promise.all([
    prisma.givingLink.findFirst({ where: { id, churchId } }),
    prisma.church.findUnique({ where: { id: churchId }, select: { name: true } }),
    prisma.churchPricing.findUnique({ where: { churchId } }),
  ]);
  if (!link) notFound();

  const suggestedAmounts = Array.isArray(link.suggestedAmountsJson)
    ? (link.suggestedAmountsJson as number[]).map((c) => (c / 100).toString()).join(", ")
    : "25, 50, 100, 250";

  const initial = {
    internalName: link.internalName,
    publicTitle: link.publicTitle,
    description: link.description || "",
    amountType: (link.amountType as "FIXED" | "VARIABLE") || "FIXED",
    fixedAmount: link.fixedAmountCents != null ? (link.fixedAmountCents / 100).toString() : "",
    minAmount: link.minAmountCents != null ? (link.minAmountCents / 100).toString() : "",
    maxAmount: link.maxAmountCents != null ? (link.maxAmountCents / 100).toString() : "",
    suggestedAmounts,
    allowCustomAmount: link.allowCustomAmount,
    linkType: (link.linkType as "ONE_TIME" | "MULTI_USE") || "MULTI_USE",
    validityKey: link.expiresAt ? "custom" : "none",
    customExpiresAt: link.expiresAt ? new Date(link.expiresAt).toISOString().slice(0, 16) : "",
    maxSuccessfulUses: link.maxSuccessfulUses?.toString() || "",
    maxCollectedAmount: link.maxCollectedAmountCents != null ? (link.maxCollectedAmountCents / 100).toString() : "",
    fundName: link.fundName || "",
    allowedPaymentMethods: parseAllowedPaymentMethods(link.allowedPaymentMethodsJson),
    donorFieldSettings: parseDonorFieldSettings(link.donorFieldSettingsJson),
    feeCoverEnabled: link.feeCoverEnabled,
    feeCoverDefaultOn: link.feeCoverDefaultOn,
    recurringEnabled: link.recurringEnabled,
    allowedFrequencies: parseAllowedFrequencies(link.allowedFrequenciesJson),
    receiptSettings: parseReceiptSettings(link.receiptSettingsJson),
    statementDescriptor: link.statementDescriptor || "",
    internalNote: link.internalNote || "",
    referenceNumber: link.referenceNumber || "",
    successReturnUrl: link.successReturnUrl || "",
    failureReturnUrl: link.failureReturnUrl || "",
    cancelReturnUrl: link.cancelReturnUrl || "",
    branding: parseBrandingSettings(link.brandingSettingsJson),
  };

  return (
    <div>
      <Link href={`/merchant/giving-links/${id}`} className="text-sm text-blue-600 hover:underline flex items-center gap-1 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Giving Link
      </Link>
      <h2 className="text-lg font-bold text-slate-900 mb-6">Edit Giving Link</h2>
      <GivingLinkBuilderForm
        mode="edit"
        linkId={id}
        initial={initial}
        churchName={church?.name || "Your Organization"}
        pricing={{
          cardPercentageFee: pricing?.cardPercentageFee ?? null,
          cardFixedFeeCents: pricing?.cardFixedFeeCents ?? null,
          achFixedFeeCents: pricing?.achFixedFeeCents ?? null,
        }}
      />
    </div>
  );
}
