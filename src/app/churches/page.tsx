import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function ChurchesPage() {
  return (
    <div className="py-24 px-6 min-h-screen bg-white">
      <div className="max-w-4xl mx-auto text-center mb-16">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 mb-6">
          Tailored for <span className="text-[#eab308]">Churches & Nonprofits</span>
        </h1>
        <p className="text-lg text-slate-600 mb-10">
          WGC Payments understands the unique needs of ministries. We provide the robust tools you need to receive and manage donations securely.
        </p>
        <Link 
          href="/start" 
          className="inline-flex items-center gap-2 metallic-gold px-8 py-4 text-sm font-bold rounded-xl shadow-lg transition-all text-slate-900"
        >
          Start Onboarding
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
