"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import DonorFormModal from "@/components/merchant/DonorFormModal";

export default function AddDonorButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
      >
        <Plus className="w-4 h-4" />
        Add Donor
      </button>
      {open && <DonorFormModal mode="create" onClose={() => setOpen(false)} />}
    </>
  );
}
