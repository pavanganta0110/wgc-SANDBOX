"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import TakePaymentDialog from "@/components/merchant/TakePaymentDialog";

/**
 * Take a Payment is launched from the sidebar (Giving → Take a Payment),
 * which links here with ?takePayment=1. Closing the dialog drops the param so
 * a refresh doesn't reopen it.
 */
export default function PaymentsHeaderActions({
  openOnLoad,
  finixMerchantId,
  churchName,
  pricing,
}: {
  openOnLoad: boolean;
  finixMerchantId: string;
  churchName: string;
  pricing: { cardPercentageFee: number | null; cardFixedFeeCents: number | null; achFixedFeeCents: number | null };
}) {
  const router = useRouter();
  const [showTakePayment, setShowTakePayment] = useState(openOnLoad);

  if (!showTakePayment) return null;
  return (
    <TakePaymentDialog
      finixMerchantId={finixMerchantId}
      churchName={churchName}
      pricing={pricing}
      onClose={() => {
        setShowTakePayment(false);
        router.replace("/merchant/transactions/payments", { scroll: false });
      }}
    />
  );
}
