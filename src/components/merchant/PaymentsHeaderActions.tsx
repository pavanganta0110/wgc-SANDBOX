"use client";

import { useState } from "react";
import CreateGivingPageLinkDialog from "@/components/merchant/CreateGivingPageLinkDialog";
import TakePaymentDialog from "@/components/merchant/TakePaymentDialog";

export default function PaymentsHeaderActions({
  finixMerchantId,
  churchName,
  pricing,
}: {
  finixMerchantId: string;
  churchName: string;
  pricing: { cardPercentageFee: number | null; cardFixedFeeCents: number | null; achFixedFeeCents: number | null };
}) {
  const [showGivingLink, setShowGivingLink] = useState(false);
  const [showTakePayment, setShowTakePayment] = useState(false);

  return (
    <>
      <div className="flex items-center gap-3">
        <button
          onClick={() => setShowGivingLink(true)}
          className="px-4 py-2 rounded-xl border border-blue-200 text-sm font-semibold text-blue-600 hover:bg-blue-50 transition-colors"
        >
          Create Giving Page Link
        </button>
        <button
          onClick={() => setShowTakePayment(true)}
          className="px-4 py-2 rounded-xl bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          Take a Payment
        </button>
      </div>

      {showGivingLink && <CreateGivingPageLinkDialog onClose={() => setShowGivingLink(false)} />}

      {showTakePayment && (
        <TakePaymentDialog
          finixMerchantId={finixMerchantId}
          churchName={churchName}
          pricing={pricing}
          onClose={() => setShowTakePayment(false)}
        />
      )}
    </>
  );
}
