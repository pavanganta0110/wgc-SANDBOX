"use client";

import { useEffect, useState } from "react";

/** A QR code for a web address, drawn in the browser (nothing is sent anywhere). `onData` hands back the PNG for a download link. */
export default function QrImage({ url, size = 220, className, onData }: { url: string; size?: number; className?: string; onData?: (dataUrl: string) => void }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void import("qrcode").then((QR) => QR.toDataURL(url, { width: size * 2, margin: 1, errorCorrectionLevel: "M" })).then((dataUrl) => {
      if (!alive) return;
      setSrc(dataUrl);
      onData?.(dataUrl);
    });
    return () => { alive = false; };
    // onData is a callback from the parent and is intentionally not a dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, size]);
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt="QR code to register and bid" width={size} height={size} className={className} /> : <div style={{ width: size, height: size }} className={className} />;
}
