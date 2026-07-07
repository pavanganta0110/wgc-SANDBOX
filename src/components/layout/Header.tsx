"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import GatewayIcon from "@/components/ui/GatewayIcon";

const NAV_LINKS = [
  { name: "Home", href: "/" },
  { name: "Partners", href: "/software-partners" },
  { name: "Pricing", href: "/pricing" },
  { name: "Developers", href: "/developers" },
  { name: "Demo", href: "/start" },
];

export default function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const closeMenu = () => setIsMobileMenuOpen(false);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full transition-all duration-300 border-b",
        scrolled 
          ? "bg-white/80 backdrop-blur-md border-wgc-navy-100 shadow-sm py-2" 
          : "bg-white border-transparent py-4 md:py-6"
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-4 lg:px-0">
        <div className="flex justify-between items-center">
          {/* Logo */}
          <Link href="/" onClick={closeMenu} className="flex items-center gap-3 group">
            <GatewayIcon className="h-12 md:h-16 w-auto transition-transform group-hover:scale-105 duration-500" />
              <div className="flex flex-col">
                <div className="flex items-baseline">
                  <span className="text-3xl md:text-5xl font-bold tracking-[0.05em] text-[#010409] leading-[0.9]">WGC</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[7px] md:text-[9px] uppercase tracking-[0.25em] text-[#010409]/70 whitespace-nowrap leading-tight mt-1">Waypoint Gateway Collective</span>
                  <div className="h-[1.5px] w-full bg-[#eab308] my-1"></div>
                  <span className="text-[6px] md:text-[8px] italic text-[#010409]/50 leading-none">1 Samuel 7:12</span>
                </div>
              </div>
          </Link>

          {/* Right Align: Navigation + CTA */}
          <div className="hidden lg:flex items-center gap-12">
            <nav className="flex items-center gap-10">
              {NAV_LINKS.map((link) => (
                <Link 
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "text-[12px] tracking-[0.1em] font-bold transition-all hover:text-black",
                    pathname === link.href 
                      ? "text-[#eab308]" 
                      : "text-[#010409]"
                  )}
                >
                  {link.name}
                </Link>
              ))}
            </nav>

            {/* Desktop CTA */}
            <div className="flex items-center gap-6">
              <Link href={process.env.NEXT_PUBLIC_FINIX_DASHBOARD_LOGIN_URL || "#"} className="text-[12px] font-bold text-[#010409] hover:text-[#eab308] transition-all tracking-[0.1em]">
                Login
              </Link>
              <Link 
                href="/start" 
                className="metallic-gold px-10 py-4 text-[13px] font-bold rounded-2xl shadow-2xl transition-all tracking-wide"
              >
                Get Started
              </Link>
            </div>
          </div>

          {/* Mobile menu button */}
          <div className="flex items-center md:hidden">
            <button 
              type="button" 
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="inline-flex items-center justify-center p-2 rounded-xl text-black hover:bg-gray-100 transition-all"
            >
              <span className="sr-only">Open main menu</span>
              {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <div className={cn(
        "lg:hidden absolute top-full left-0 w-full transition-all duration-300 ease-in-out bg-wgc-navy-950 shadow-2xl border-t border-white/5 overflow-hidden",
        isMobileMenuOpen ? "max-h-screen opacity-100" : "max-h-0 opacity-0 pointer-events-none"
      )}>
        <div className="px-8 pt-8 pb-12 space-y-4">
          <div className="mb-6">
            <span className="text-[10px] font-bold text-[#C9973A] uppercase tracking-[0.4em] block mb-6">Platform</span>
            <div className="flex flex-col gap-4">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={closeMenu}
                  className={cn(
                    "text-xl font-bold tracking-tight transition-all",
                    pathname === link.href 
                      ? "text-[#eab308]" 
                      : "text-white hover:text-[#eab308]"
                  )}
                >
                  {link.name === "Pricing" ? "Fee Structure" : 
                   link.name === "Home" ? "Home" :
                   link.name === "Partners" ? "Partners" :
                   link.name === "Developers" ? "Api Reference" :
                   link.name}
                </Link>
              ))}
            </div>
          </div>
          
          <div className="mt-8 pt-8 border-t border-white/5 flex flex-col gap-4">
            <Link 
              href={process.env.NEXT_PUBLIC_FINIX_DASHBOARD_LOGIN_URL || "#"} 
              onClick={closeMenu}
              className="w-full flex items-center justify-center px-6 py-4 border border-white/10 rounded-xl text-[12px] font-bold text-white bg-white/5 tracking-wide transition-all active:scale-95"
            >
              Ministry Login
            </Link>
            <Link 
              href="/start" 
              onClick={closeMenu}
              className="w-full flex items-center justify-center px-6 py-4 metallic-gold rounded-xl text-[12px] font-bold text-wgc-navy-950 shadow-lg tracking-wide transition-all active:scale-95"
            >
              Request Connection
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
