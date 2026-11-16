"use client";

import { useState } from "react";

/** A link in a box with a Copy button. */
export default function CopyLinkBox({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="flex-1 min-w-0 break-all rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs">{url}</code>
      <button
        type="button"
        className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        onClick={() => {
          void navigator.clipboard?.writeText(url).then(() => setCopied(true), () => {});
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}
