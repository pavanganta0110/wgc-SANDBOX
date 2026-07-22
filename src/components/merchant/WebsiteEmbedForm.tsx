"use client";

import { useMemo, useState } from "react";
import toast from "react-hot-toast";

interface GivingLinkOption {
  id: string;
  publicSlug: string;
  publicTitle: string;
}

// Generated embed code must always point at the canonical production
// domain — never at whatever Vercel/preview URL happens to be serving the
// dashboard the merchant copied the snippet from (NEXT_PUBLIC_APP_URL is
// wgc-payments-finix-first-wgcpayments.vercel.app in sandbox). The embed
// loader itself is environment-agnostic vanilla JS; only its own script
// src needs to be pinned here.
const WGC_EMBED_SCRIPT_ORIGIN = "https://www.wgcpayments.com";

const PLATFORMS = [
  { key: "wordpress", label: "WordPress", steps: ["Edit the page or post where you want the button/form.", "Add a Custom HTML block.", "Paste the code into the block.", "Publish or update the page."] },
  { key: "wix", label: "Wix", steps: ["Open the Wix Editor for your site.", "Click Add Elements, then choose Embed Code.", "Select Embed HTML and paste the code.", "Publish your site."] },
  { key: "squarespace", label: "Squarespace", steps: ["Edit the page where you want the button/form.", "Add a Code Block.", "Paste the code into the block.", "Save and publish."] },
  { key: "webflow", label: "Webflow", steps: ["Open the Designer for your page.", "Drag in an Embed component.", "Paste the code into the Embed component.", "Publish your site."] },
  { key: "ghl", label: "GoHighLevel", steps: ["Edit the funnel or website page.", "Add a Custom JS/HTML element.", "Paste the code into the element.", "Save and publish."] },
  { key: "html", label: "Plain HTML", steps: ["Open your site's HTML file.", "Paste the button code just before the closing </body> tag, or paste the inline-form code exactly where you want the form to appear.", "Save and upload/deploy the file."] },
];

export default function WebsiteEmbedForm({
  appUrl,
  givingLinks,
  initialEmbedDomainRestrictionEnabled,
  initialAllowedDomains,
}: {
  appUrl: string;
  givingLinks: GivingLinkOption[];
  initialEmbedDomainRestrictionEnabled: boolean;
  initialAllowedDomains: string[];
}) {
  const [slug, setSlug] = useState(givingLinks[0]?.publicSlug || "");
  const [mode, setMode] = useState<"button" | "inline">("button");
  const [buttonText, setButtonText] = useState("Give Now");
  const [size, setSize] = useState<"small" | "medium" | "large">("medium");
  const [radius, setRadius] = useState<"rounded" | "square">("rounded");
  const [color, setColor] = useState<"gold" | "navy" | "black" | "white">("gold");
  const [openPlatform, setOpenPlatform] = useState<string | null>("wordpress");

  const [domainRestrictionEnabled, setDomainRestrictionEnabled] = useState(initialEmbedDomainRestrictionEnabled);
  const [domainsText, setDomainsText] = useState(initialAllowedDomains.join("\n"));
  const [savingDomains, setSavingDomains] = useState(false);

  const selectedLink = givingLinks.find((l) => l.publicSlug === slug);
  const scriptSrc = `${WGC_EMBED_SCRIPT_ORIGIN}/embed/wgc-giving.js`;
  const embedUrl = slug ? `${appUrl}/embed/${slug}` : "";

  const code = useMemo(() => {
    if (mode === "button") {
      return `<script\n  src="${scriptSrc}"\n  data-wgc-slug="${slug}"\n  data-wgc-mode="button"\n  data-wgc-button-text="${buttonText}"\n  data-wgc-button-size="${size}"\n  data-wgc-button-color="${color}"\n  data-wgc-button-radius="${radius}">\n</script>`;
    }
    return `<div\n  data-wgc-giving\n  data-wgc-slug="${slug}"\n  data-wgc-mode="inline">\n</div>\n\n<script async src="${scriptSrc}"></script>`;
  }, [mode, slug, buttonText, size, color, radius, scriptSrc]);

  async function handleCopy() {
    await navigator.clipboard.writeText(code);
    toast.success("Code copied");
    if (selectedLink) {
      fetch(`/api/merchant/giving-links/${selectedLink.id}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: "EMBED" }),
      }).catch(() => {});
    }
  }

  async function handleSaveDomains(e: React.FormEvent) {
    e.preventDefault();
    setSavingDomains(true);
    try {
      const domains = domainsText.split("\n").map((d) => d.trim()).filter(Boolean);
      const res = await fetch("/api/merchant/settings/embed", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embedDomainRestrictionEnabled: domainRestrictionEnabled, embedAllowedDomains: domains }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Failed to save domain restrictions");
        return;
      }
      setDomainsText((data.embedAllowedDomains || []).join("\n"));
      toast.success("Domain restrictions saved");
    } catch {
      toast.error("Failed to save domain restrictions");
    } finally {
      setSavingDomains(false);
    }
  }

  if (givingLinks.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Create a Giving Link first, then come back here to generate a website embed for it.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {/* Configuration */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Giving page</label>
            <select value={slug} onChange={(e) => setSlug(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none">
              {givingLinks.map((l) => (
                <option key={l.id} value={l.publicSlug}>{l.publicTitle}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Embed type</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setMode("button")} className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold border ${mode === "button" ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 text-slate-700"}`}>
                Donate Button
              </button>
              <button type="button" onClick={() => setMode("inline")} className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold border ${mode === "inline" ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 text-slate-700"}`}>
                Inline Form
              </button>
            </div>
          </div>

          {mode === "button" && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Button text</label>
                <input value={buttonText} onChange={(e) => setButtonText(e.target.value)} maxLength={40} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Size</label>
                  <select value={size} onChange={(e) => setSize(e.target.value as typeof size)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none">
                    <option value="small">Small</option>
                    <option value="medium">Medium</option>
                    <option value="large">Large</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Corners</label>
                  <select value={radius} onChange={(e) => setRadius(e.target.value as typeof radius)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none">
                    <option value="rounded">Rounded</option>
                    <option value="square">Square</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Color</label>
                  <select value={color} onChange={(e) => setColor(e.target.value as typeof color)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none">
                    <option value="gold">Gold</option>
                    <option value="navy">Navy</option>
                    <option value="black">Black</option>
                    <option value="white">White</option>
                  </select>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Preview */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Preview</label>
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 min-h-[220px] flex items-center justify-center">
            <div className="text-center space-y-3">
              <button
                type="button"
                onClick={() => embedUrl && window.open(embedUrl, "wgc_preview", "width=480,height=720")}
                style={{
                  padding: size === "small" ? "8px 16px" : size === "large" ? "16px 28px" : "12px 22px",
                  fontSize: size === "small" ? 13 : size === "large" ? 17 : 15,
                  fontWeight: 700,
                  borderRadius: radius === "rounded" ? 10 : 2,
                  backgroundColor: color === "gold" ? "#EAB308" : color === "navy" ? "#0B1220" : color === "black" ? "#111111" : "#FFFFFF",
                  color: color === "white" ? "#111111" : color === "gold" ? "#0B1220" : "#FFFFFF",
                  border: color === "white" ? "1px solid #D1D5DB" : "none",
                  cursor: "pointer",
                }}
              >
                {buttonText || "Give Now"}
              </button>
              <p className="text-xs text-slate-400 max-w-xs">
                {mode === "button"
                  ? "Click to preview the real giving form — it opens in a secure popup window."
                  : "This button appears inline on the host page. Clicking it opens the real giving form in a secure popup window (Finix's payment form can't run inside an iframe, so the payment step always opens this way)."}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Code + copy */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-slate-600">Embed code</label>
          <button type="button" onClick={handleCopy} className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800">
            Copy Code
          </button>
        </div>
        <pre className="bg-slate-900 text-slate-100 text-xs rounded-xl p-4 overflow-x-auto whitespace-pre-wrap break-all">{code}</pre>
      </div>

      {/* Setup instructions */}
      <div>
        <h4 className="text-xs font-semibold text-slate-600 mb-2">Setup instructions</h4>
        <div className="space-y-2">
          {PLATFORMS.map((p) => (
            <div key={p.key} className="border border-slate-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenPlatform(openPlatform === p.key ? null : p.key)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold text-slate-900 bg-slate-50 hover:bg-slate-100"
              >
                {p.label}
                <span className="text-slate-400">{openPlatform === p.key ? "−" : "+"}</span>
              </button>
              {openPlatform === p.key && (
                <ol className="list-decimal pl-8 py-3 space-y-1 text-sm text-slate-600">
                  {p.steps.map((s, i) => <li key={i}>{s}</li>)}
                </ol>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Domain restrictions */}
      <form onSubmit={handleSaveDomains} className="border-t border-slate-100 pt-6 space-y-3">
        <h4 className="text-xs font-semibold text-slate-600">Domain restrictions (optional)</h4>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={domainRestrictionEnabled} onChange={(e) => setDomainRestrictionEnabled(e.target.checked)} />
          Only allow embedding on approved domains
        </label>
        {domainRestrictionEnabled && (
          <textarea
            value={domainsText}
            onChange={(e) => setDomainsText(e.target.value)}
            rows={4}
            placeholder={"churchwebsite.org\nwww.churchwebsite.org"}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none font-mono"
          />
        )}
        <button type="submit" disabled={savingDomains} className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold disabled:opacity-50">
          {savingDomains ? "Saving…" : "Save domain restrictions"}
        </button>
      </form>
    </div>
  );
}
