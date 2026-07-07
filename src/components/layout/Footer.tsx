import Link from "next/link";
import GatewayIcon from "@/components/ui/GatewayIcon";

export default function Footer() {
  return (
    <footer className="bg-wgc-off py-16 text-wgc-navy-900 border-t border-wgc-navy-100 relative overflow-hidden">
      {/* Subtle accent glow */}
      <div className="absolute -top-24 -right-24 w-96 h-96 bg-wgc-gold-500/5 blur-3xl rounded-full"></div>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-4 lg:px-0 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12 md:gap-20">
          <div className="md:col-span-4 lg:col-span-3">
            <Link href="/" className="flex items-center gap-4 mb-12 group w-fit">
              <GatewayIcon className="h-16 w-auto transition-transform group-hover:scale-105 duration-500" />
              <div className="flex flex-col">
                <div className="flex items-baseline">
                   <span className="text-4xl font-bold tracking-[0.05em] text-[#010409] leading-[0.9]">WGC</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-[0.25em] text-[#010409] whitespace-nowrap leading-tight mt-1">Waypoint Gateway Collective</span>
                  <div className="h-[2px] w-full bg-[#eab308] my-1.5"></div>
                  <span className="text-[9px] italic text-[#010409] leading-none">1 Samuel 7:12</span>
                </div>
              </div>
            </Link>
          </div>
          <div className="md:col-span-8 lg:col-span-9 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-12 xl:gap-20">
            <div>
              <h3 className="text-[11px] font-bold text-[#eab308] tracking-widest uppercase mb-10">Platform</h3>
              <ul role="list" className="space-y-6">
                <FooterLink href="/">Home</FooterLink>
                <FooterLink href="/software-partners">Partners</FooterLink>
                <FooterLink href="/developers">Api Reference</FooterLink>
                <FooterLink href="/how-it-works">How it Works</FooterLink>
                <FooterLink href="/pricing">Fee Structure</FooterLink>
              </ul>
            </div>
            <div>
              <h3 className="text-[11px] font-bold text-[#eab308] tracking-widest uppercase mb-10">Resources</h3>
              <ul role="list" className="space-y-6">
                <FooterLink href="/resources/church-payment-processing-guide-2026">
                  Payment Guide
                </FooterLink>
                <FooterLink href="/resources/white-label-payment-processing-nonprofit-church-software">
                  White-Labeling
                </FooterLink>
                <FooterLink href="/resources/church-payment-processing-pricing-guide">
                  Fee Breakdown
                </FooterLink>
                <FooterLink href="/kansas-city/church-payment-processing">
                  Kansas City Churches
                </FooterLink>
                <FooterLink href="/kansas-city/nonprofit-payment-processing">
                  Kansas City Nonprofits
                </FooterLink>
                <FooterLink href="/kansas-city/tithely-alternative">
                  Tithe.ly Alternative KC
                </FooterLink>
              </ul>
            </div>
            <div>
              <h3 className="text-[11px] font-bold text-[#eab308] tracking-widest uppercase mb-10">Mission</h3>
              <ul role="list" className="space-y-6">
                <FooterLink href="/about">Our Story</FooterLink>
                <FooterLink href="/contact">Support</FooterLink>
                <FooterLink href="/legal/terms">Governance</FooterLink>
              </ul>
            </div>
            <div>
              <h3 className="text-[11px] font-bold text-[#eab308] tracking-widest uppercase mb-10">Legal</h3>
              <ul role="list" className="space-y-6">
                <FooterLink href="/legal/privacy">Privacy Policy</FooterLink>
                <FooterLink href="/legal/terms">Terms of Use</FooterLink>
                <FooterLink href="/legal/compliance">Compliance</FooterLink>
              </ul>
            </div>
          </div>
        </div>
        
        {/* Footer Bottom */}
        <div className="mt-24 border-t border-wgc-navy-100 pt-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="flex flex-col gap-1">
            <p className="text-[11px] font-bold text-wgc-navy-700 uppercase tracking-widest">
              &copy; 2026 Way Point Gateway Collective.
            </p>
            <p className="text-[10px] text-wgc-navy-700 font-medium italic">A Kingdom-First White Label Payment Platform.</p>
          </div>
          <div className="flex items-center gap-8">
            <Link href="/legal/privacy" className="text-[10px] font-bold text-wgc-navy-700 hover:text-black transition-all uppercase tracking-[0.2em]">Privacy</Link>
            <Link href="/legal/compliance" className="text-[10px] font-bold text-wgc-navy-700 hover:text-black transition-all uppercase tracking-[0.2em]">Compliance</Link>
            <div className="h-4 w-px bg-wgc-navy-100 hidden md:block"></div>
            <p className="text-[10px] text-wgc-navy-700 uppercase tracking-widest font-bold">PCI Level 1 Certified</p>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="text-[13px] font-bold text-[#010409] hover:text-[#eab308] transition-all tracking-wide">
        {children}
      </Link>
    </li>
  );
}

function ResourceLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="text-[12px] font-bold text-wgc-navy-700 hover:text-wgc-navy-900 transition-all uppercase tracking-wider leading-relaxed block">
        {children}
      </Link>
    </li>
  );
}
