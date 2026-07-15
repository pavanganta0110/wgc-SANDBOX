"use client";

import { useState } from "react";
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
  const [showTakePayment, setShowTakePayment] = useState(false);

  return (
    <>
      <div className="flex items-center gap-3">
        <button
          onClick={() => setShowTakePayment(true)}
          className="px-4 py-2 rounded-xl bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          Take a Payment
        </button>
      </div>

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
