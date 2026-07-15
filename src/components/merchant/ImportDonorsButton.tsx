"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import DonorImportModal from "@/components/merchant/DonorImportModal";

export default function ImportDonorsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        <Upload className="w-4 h-4" />
        Import CSV
      </button>
      {open && <DonorImportModal onClose={() => setOpen(false)} />}
    </>
  );
}
