"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Download, Printer } from "lucide-react";

/** The donor portal link (copyable) plus a QR code the church can download or print for a bulletin, flyer or lobby sign. */
export default function CopyDonorPortalLink({ url, organizationName }: { url: string; organizationName: string }) {
  const [copied, setCopied] = useState(false);
  const [qrPngUrl, setQrPngUrl] = useState<string | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const fileBase = `${organizationName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "donor"}-giving-portal-qr`;

  useEffect(() => {
    // Larger than on-screen so a printed copy stays sharp.
    QRCode.toDataURL(url, { width: 640, margin: 2 }).then(setQrPngUrl).catch(() => {});
    QRCode.toString(url, { type: "svg", margin: 2 }).then(setQrSvg).catch(() => {});
  }, [url]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the URL is still selectable in the field.
    }
  };

  const save = (href: string, filename: string) => {
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    a.click();
  };

  const downloadSvg = () => {
    if (!qrSvg) return;
    const blobUrl = URL.createObjectURL(new Blob([qrSvg], { type: "image/svg+xml" }));
    save(blobUrl, `${fileBase}.svg`);
    URL.revokeObjectURL(blobUrl);
  };

  const print = () => {
    if (!qrPngUrl) return;
    const w = window.open("", "_blank", "width=600,height=800");
    if (!w) return;
    const name = organizationName.replace(/[<>&"]/g, "");
    w.document.write(`<html><head><title>${name} giving portal</title></head><body style="font-family:sans-serif;text-align:center;padding:48px;">
      <h1 style="margin:0 0 8px 0;">${name}</h1>
      <p style="font-size:20px;margin:0 0 24px 0;">See your giving, statements and recurring gifts</p>
      <img src="${qrPngUrl}" style="width:360px;height:360px;" />
      <p style="font-size:16px;margin-top:24px;">Scan with your phone camera</p>
    </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  const secondary = "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50";

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700" />
        <button type="button" onClick={copy} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <div className="flex items-center gap-5">
        {qrPngUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrPngUrl} alt={`QR code for ${organizationName}'s donor portal`} className="h-32 w-32 rounded-xl border border-slate-100" />
        ) : (
          <div className="h-32 w-32 rounded-xl bg-slate-50" />
        )}
        <div className="space-y-2">
          <p className="text-xs text-slate-500">Scanning this opens your donor portal. Put it on a bulletin, flyer or lobby sign.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={secondary} disabled={!qrPngUrl} onClick={() => qrPngUrl && save(qrPngUrl, `${fileBase}.png`)}>
              <Download className="h-3.5 w-3.5" /> PNG
            </button>
            <button type="button" className={secondary} disabled={!qrSvg} onClick={downloadSvg}>
              <Download className="h-3.5 w-3.5" /> SVG
            </button>
            <button type="button" className={secondary} disabled={!qrPngUrl} onClick={print}>
              <Printer className="h-3.5 w-3.5" /> Print
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
