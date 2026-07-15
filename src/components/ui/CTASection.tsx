import Link from "next/link";

interface CTASectionProps {
  headline: string;
  subheadline: string;
  ctaText: string;
  ctaLink: string;
}

export default function CTASection({ headline, subheadline, ctaText, ctaLink }: CTASectionProps) {
  return (
    <div className="bg-wgc-navy-950 relative py-28 lg:py-32 overflow-hidden border-t border-white/5 shadow-2xl">
      {/* Subtle decorative elements */}
      <div className="absolute inset-0 opacity-[0.05]">
        <svg className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2" width="100%" height="100%" fill="none">
          <defs>
            <pattern id="cta-pattern-new" x="0" y="0" width="60" height="60" patternUnits="userSpaceOnUse">
              <circle cx="3" cy="3" r="1.5" className="text-wgc-gold-500" fill="currentColor" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#cta-pattern-new)" />
        </svg>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
        <h2 className="text-5xl font-bold tracking-tight !text-white sm:text-6xl lg:text-8xl mb-8 leading-none">
          {headline}
        </h2>
        <p className="mt-6 text-[13px] sm:text-sm text-white/80 max-w-2xl mx-auto mb-12 leading-relaxed font-bold tracking-wide">
          {subheadline}
        </p>
        <Link 
          href={ctaLink} 
          className="metallic-gold text-wgc-navy-950 inline-flex items-center justify-center px-12 py-5 text-[13px] font-bold rounded-2xl shadow-2xl transition-all hover:scale-105 active:scale-95 tracking-wide"
        >
          {ctaText}
        </Link>
      </div>
    </div>
  );
}
