"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import DonorFormModal from "@/components/merchant/DonorFormModal";
import { usePaymentWording } from "@/components/merchant/PaymentModeContext";

export default function AddDonorButton() {
  const pw = usePaymentWording();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
      >
        <Plus className="w-4 h-4" />
        {pw("Add Donor")}
      </button>
      {open && <DonorFormModal mode="create" onClose={() => setOpen(false)} />}
    </>
  );
}
