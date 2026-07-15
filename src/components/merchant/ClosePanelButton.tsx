"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";

export default function ClosePanelButton() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleClose = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("id");
    const qs = params.toString();
    router.push(qs ? `?${qs}` : "?", { scroll: false });
  };

  return (
    <button
      onClick={handleClose}
      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
    >
      <X className="w-4 h-4" />
    </button>
  );
}
