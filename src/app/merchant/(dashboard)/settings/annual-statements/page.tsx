import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import StatementSettingsForm from "@/components/merchant/StatementSettingsForm";

export default async function StatementSettingsPage() {
  const session = await getSession();
  const churchId = session!.churchId!;

  const church = await prisma.church.findUnique({
    where: { id: churchId },
    select: {
      logoUrl: true,
      taxId: true,
      website: true,
      statementSenderName: true,
      statementReplyToEmail: true,
      statementSubjectTemplate: true,
      statementThankYouMessage: true,
      statementDisclaimer: true,
      statementShowDonorCoveredFees: true,
      statementShowTaxId: true,
      statementShowWebsite: true,
      statementSignatureName: true,
      statementSignatureTitle: true,
      statementSignatureImageUrl: true,
    },
  });

  return (
    <div className="space-y-6">
      <Link href="/merchant/settings" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Settings
      </Link>
      <h2 className="text-lg font-bold text-slate-900">Receipts &amp; Annual Statements</h2>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 max-w-xl">
        <StatementSettingsForm
          initial={{
            logoUrl: church?.logoUrl ?? null,
            taxId: church?.taxId ?? null,
            website: church?.website ?? null,
            statementSenderName: church?.statementSenderName ?? null,
            statementReplyToEmail: church?.statementReplyToEmail ?? null,
            statementSubjectTemplate: church?.statementSubjectTemplate ?? null,
            statementThankYouMessage: church?.statementThankYouMessage ?? null,
            statementDisclaimer: church?.statementDisclaimer ?? null,
            statementShowDonorCoveredFees: church?.statementShowDonorCoveredFees ?? false,
            statementShowTaxId: church?.statementShowTaxId ?? false,
            statementShowWebsite: church?.statementShowWebsite ?? false,
            statementSignatureName: church?.statementSignatureName ?? null,
            statementSignatureTitle: church?.statementSignatureTitle ?? null,
            statementSignatureImageUrl: church?.statementSignatureImageUrl ?? null,
          }}
        />
      </div>
    </div>
  );
}
