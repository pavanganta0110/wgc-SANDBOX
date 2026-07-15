import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function ResourceCTA() {
  return (
    <section className="py-24 bg-white border-t border-wgc-navy-50">
      <div className="max-w-4xl mx-auto px-4 text-center">
        <h2 className="text-3xl md:text-wgc-navy-900xl font-bold text-wgc-navy-900 mb-6 tracking-tight uppercase">
          Launch branded payments <span className="text-wgc-gold-500">with WGC</span>
        </h2>
        <p className="text-lg text-wgc-navy-600 mb-10 max-w-2xl mx-auto font-bold uppercase tracking-tight opacity-90 leading-relaxed">
          Give churches and nonprofit organizations a seamless payment experience under your own brand.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/register" 
            className="w-full sm:w-auto bg-wgc-gold-500 text-wgc-navy-900 px-10 py-4 rounded-2xl text-[11px] font-bold uppercase tracking-[0.2em] shadow-xl shadow-wgc-gold-500/20 hover:bg-black hover:text-wgc-navy-900 hover:scale-105 active:scale-95 transition-all">
            Get Started
          </Link>
          <Link href="/contact" 
            className="w-full sm:w-auto px-10 py-4 border-2 border-wgc-navy-100 rounded-2xl text-[11px] font-bold text-wgc-navy-900 uppercase tracking-[0.2em] hover:border-black hover:bg-black hover:text-wgc-navy-900 transition-all flex items-center justify-center gap-2">
            Contact Sales
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
