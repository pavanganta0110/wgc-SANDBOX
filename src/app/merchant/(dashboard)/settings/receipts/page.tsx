import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import ReceiptSettingsForm from "@/components/merchant/ReceiptSettingsForm";
import { DEFAULT_RECEIPT_SUBJECT_TEMPLATE, DEFAULT_RECEIPT_THANK_YOU_MESSAGE, DEFAULT_RECEIPT_DISCLAIMER } from "@/lib/settings/receiptDefaults";
import { DEFAULT_NO_GOODS_SERVICES_TEXT, DEFAULT_GOODS_SERVICES_TEMPLATE } from "@/lib/settings/acknowledgmentDefaults";

export default async function ReceiptSettingsPage() {
  const session = await getSession();
  const church = await prisma.church.findUnique({ where: { id: session!.churchId! } });
  if (!church) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      <h3 className="text-sm font-bold text-slate-900 mb-1">Receipts</h3>
      <p className="text-xs text-slate-500 mb-6">
        Donation receipts summarize a gift for the donor's own records. WGC does not provide tax advice, and receipts never state that a gift is tax-deductible.
      </p>
      <ReceiptSettingsForm
        initial={{
          receiptAutoSend: church.receiptAutoSend,
          receiptSenderName: church.receiptSenderName || "",
          receiptReplyToEmail: church.receiptReplyToEmail || "",
          receiptSubjectTemplate: church.receiptSubjectTemplate || DEFAULT_RECEIPT_SUBJECT_TEMPLATE,
          receiptHeader: church.receiptHeader || "",
          receiptThankYouMessage: church.receiptThankYouMessage || DEFAULT_RECEIPT_THANK_YOU_MESSAGE,
          receiptFooter: church.receiptFooter || "",
          receiptShowAddress: church.receiptShowAddress,
          receiptShowPhone: church.receiptShowPhone,
          receiptShowEmail: church.receiptShowEmail,
          receiptShowFund: church.receiptShowFund,
          receiptShowDonorCoveredFee: church.receiptShowDonorCoveredFee,
          receiptShowPaymentMethodLastFour: church.receiptShowPaymentMethodLastFour,
          receiptShowRecurringSchedule: church.receiptShowRecurringSchedule,
          receiptShowDonationReference: church.receiptShowDonationReference,
          receiptShowTaxId: church.receiptShowTaxId,
          receiptShowWebsite: church.receiptShowWebsite,
          receiptDisclaimer: church.receiptDisclaimer || DEFAULT_RECEIPT_DISCLAIMER,
          receiptSendCopyToOrg: church.receiptSendCopyToOrg,
          receiptSupportContact: church.receiptSupportContact || "",
          receiptNumberPrefix: church.receiptNumberPrefix || "RCPT",
          acknowledgmentNoGoodsServicesText: church.acknowledgmentNoGoodsServicesText || DEFAULT_NO_GOODS_SERVICES_TEXT,
          acknowledgmentGoodsServicesTemplate: church.acknowledgmentGoodsServicesTemplate || DEFAULT_GOODS_SERVICES_TEMPLATE,
        }}
      />
    </div>
  );
}
