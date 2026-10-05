"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Copy } from "lucide-react";
import { inputClass, labelClass, secondaryButton } from "@/components/events/merchant/api";

type Mode = "button" | "inline";
type Size = "small" | "medium" | "large";
type Color = "gold" | "navy" | "black" | "white";
type Radius = "rounded" | "square";

const PREVIEW_COLORS: Record<Color, { bg: string; fg: string; border?: string }> = {
  gold: { bg: "#EAB308", fg: "#0B1220" },
  navy: { bg: "#0B1220", fg: "#FFFFFF" },
  black: { bg: "#111111", fg: "#FFFFFF" },
  white: { bg: "#FFFFFF", fg: "#111111", border: "#D1D5DB" },
};
const PREVIEW_SIZES: Record<Size, { padding: string; fontSize: string }> = {
  small: { padding: "8px 16px", fontSize: "13px" },
  medium: { padding: "12px 22px", fontSize: "15px" },
  large: { padding: "16px 28px", fontSize: "17px" },
};

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * "Add to your website" — copy-paste snippets for the event, in the same
 * two formats as the Giving Page embed (a button and an inline block), plus
 * the plain link. Snippets point at this environment's own origin, so
 * sandbox events embed from sandbox.
 */
export default function EventEmbedPanel({ slug, origin, publicUrl, takesPayment, isActive }: { slug: string; origin: string; publicUrl: string; takesPayment: boolean; isActive: boolean }) {
  const [mode, setMode] = useState<Mode>("button");
  const [text, setText] = useState("Register");
  const [size, setSize] = useState<Size>("medium");
  const [color, setColor] = useState<Color>("gold");
  const [radius, setRadius] = useState<Radius>("rounded");

  const scriptSrc = `${origin}/embed/wgc-event.js`;
  const code = useMemo(() => {
    if (mode === "button") {
      return `<script\n  src="${scriptSrc}"\n  data-wgc-slug="${slug}"\n  data-wgc-mode="button"\n  data-wgc-button-text="${escapeAttr(text.trim() || "Register")}"\n  data-wgc-button-size="${size}"\n  data-wgc-button-color="${color}"\n  data-wgc-button-radius="${radius}">\n</script>`;
    }
    return `<div data-wgc-event data-wgc-slug="${slug}"></div>\n\n<script async src="${scriptSrc}"></script>`;
  }, [mode, scriptSrc, slug, text, size, color, radius]);

  async function copy(value: string, what: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${what} copied`);
    } catch {
      toast.error("Couldn't copy — select the text and copy it manually.");
    }
  }

  const c = PREVIEW_COLORS[color];
  const sz = PREVIEW_SIZES[size];

  return (
    <section aria-labelledby="embed-heading" className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <h3 id="embed-heading" className="text-sm font-bold text-slate-900">Add to your website</h3>
      <p className="text-xs text-slate-500 mt-0.5 mb-4">Paste one of these into your site — WordPress, Squarespace, Wix (Embed HTML), Webflow or any page that accepts custom HTML.</p>

      {!isActive && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
          This event isn&apos;t Active yet, so the embed will say registration isn&apos;t open. Set the status to Active in Settings first.
        </p>
      )}

      <div role="tablist" aria-label="Embed format" className="inline-flex rounded-lg border border-slate-200 p-0.5 mb-4">
        {(["button", "inline"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`px-4 py-1.5 text-sm font-semibold rounded-md ${mode === m ? "bg-indigo-600 text-white" : "text-slate-600"}`}
          >
            {m === "button" ? "Register button" : "Inline on page"}
          </button>
        ))}
      </div>

      {mode === "button" ? (
        <div className="space-y-3 mb-4">
          <p className="text-xs text-slate-500">A button that opens the secure registration window. Works everywhere, including paid events.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label htmlFor="emb-text" className={labelClass}>Button text</label>
              <input id="emb-text" className={inputClass} value={text} maxLength={40} onChange={(e) => setText(e.target.value)} />
            </div>
            <div>
              <label htmlFor="emb-size" className={labelClass}>Size</label>
              <select id="emb-size" className={inputClass} value={size} onChange={(e) => setSize(e.target.value as Size)}>
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            </div>
            <div>
              <label htmlFor="emb-color" className={labelClass}>Color</label>
              <select id="emb-color" className={inputClass} value={color} onChange={(e) => setColor(e.target.value as Color)}>
                <option value="gold">Gold</option>
                <option value="navy">Navy</option>
                <option value="black">Black</option>
                <option value="white">White</option>
              </select>
            </div>
            <div>
              <label htmlFor="emb-radius" className={labelClass}>Corners</label>
              <select id="emb-radius" className={inputClass} value={radius} onChange={(e) => setRadius(e.target.value as Radius)}>
                <option value="rounded">Rounded</option>
                <option value="square">Square</option>
              </select>
            </div>
          </div>
          <div className="rounded-lg border border-dashed border-slate-300 p-4 flex items-center justify-center bg-slate-50" aria-label="Button preview">
            <span
              style={{
                padding: sz.padding,
                fontSize: sz.fontSize,
                background: c.bg,
                color: c.fg,
                border: c.border ? `1px solid ${c.border}` : "none",
                borderRadius: radius === "rounded" ? "10px" : "2px",
                fontWeight: 700,
              }}
            >
              {text.trim() || "Register"}
            </span>
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-500 mb-4">
          Shows the event on your page and resizes itself.{" "}
          {takesPayment
            ? "Because this event takes payment, the block shows the details with a Register & pay button that opens the secure window."
            : "This event is free, so people can register right on your page."}
        </p>
      )}

      <div className="relative">
        <label htmlFor="emb-code" className="sr-only">Embed code</label>
        <textarea id="emb-code" readOnly rows={mode === "button" ? 9 : 5} value={code} onFocus={(e) => e.currentTarget.select()} className={`${inputClass} font-mono text-xs`} />
        <button type="button" onClick={() => void copy(code, "Embed code")} className={`${secondaryButton} absolute top-2 right-2 !px-2.5 !py-1 text-xs`}>
          <Copy className="w-3.5 h-3.5 mr-1" aria-hidden="true" /> Copy
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
        <button type="button" onClick={() => void copy(publicUrl, "Link")} className="font-semibold text-indigo-600">Copy plain link</button>
        <span>Only want specific websites to embed this? Set approved domains under <Link href="/merchant/settings/embed" className="text-indigo-600 hover:underline">Website Embed settings</Link>.</span>
      </div>
    </section>
  );
}
