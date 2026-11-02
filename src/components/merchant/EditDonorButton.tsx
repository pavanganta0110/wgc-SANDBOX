"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import DonorFormModal, { type DonorFormValues } from "@/components/merchant/DonorFormModal";
import { usePaymentWording } from "@/components/merchant/PaymentModeContext";

export default function EditDonorButton({
  donorId,
  initialValues,
  autoOpen,
}: {
  donorId: string;
  initialValues: Partial<DonorFormValues>;
  autoOpen?: boolean;
}) {
  const pw = usePaymentWording();
  const [open, setOpen] = useState(Boolean(autoOpen));
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        <Pencil className="w-4 h-4" />
        {pw("Edit Donor")}
      </button>
      {open && <DonorFormModal mode="edit" donorId={donorId} initialValues={initialValues} onClose={() => setOpen(false)} />}
    </>
  );
}
