"use client";

import { useState, type ReactNode } from "react";
import TakePaymentDialog from "@/components/merchant/TakePaymentDialog";

/** The "Take a payment" quick action: opens the same dialog as the Payments page. */
export default function TakePaymentAction({
  finixMerchantId,
  churchName,
  pricing,
  className,
  children,
}: {
  finixMerchantId: string;
  churchName: string;
  pricing: { cardPercentageFee: number | null; cardFixedFeeCents: number | null; achFixedFeeCents: number | null };
  className: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>
      {open && (
        <TakePaymentDialog finixMerchantId={finixMerchantId} churchName={churchName} pricing={pricing} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
