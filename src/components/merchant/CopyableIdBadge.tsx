"use client";

import { useState } from "react";
import toast from "react-hot-toast";

export default function CopyableIdBadge({
  id,
  label = "ID",
  variant = "badge",
}: {
  id: string;
  label?: string;
  variant?: "badge" | "link";
}) {
  const [isHovered, setIsHovered] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(id);
    toast.success("Copied to clipboard");
  };

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <button
        onClick={handleCopy}
        className={
          variant === "link"
            ? "text-xs font-semibold text-blue-600 hover:underline"
            : "px-2 py-1 rounded-md border border-slate-200 text-xs font-semibold text-slate-500 bg-white hover:bg-slate-50"
        }
      >
        {label}
      </button>
      {isHovered && (
        <div className="absolute right-0 top-full mt-1 z-50 whitespace-nowrap bg-slate-900 text-white text-xs font-mono px-3 py-2 rounded-lg shadow-lg">
          {id} <span className="text-slate-400 font-sans">(Click To Copy)</span>
        </div>
      )}
    </div>
  );
}
