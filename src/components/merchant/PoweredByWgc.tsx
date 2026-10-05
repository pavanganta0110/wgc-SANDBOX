/** "Powered by WGC" footer link shared by the public Giving Page and Event Page. */
function wgcUrl(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.wgcpayments.com";
  if (url.includes("vercel.app") || url.includes("localhost") || url.includes("sandbox")) {
    return "https://www.wgcpayments.com";
  }
  return url;
}

export default function PoweredByWgc() {
  return (
    <div className="text-center mt-6">
      <a href={wgcUrl()} target="_blank" rel="noopener noreferrer" className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
        Powered by WGC
      </a>
    </div>
  );
}
