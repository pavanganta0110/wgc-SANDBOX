import Link from "next/link";
import { ArrowRight, ShieldCheck, CreditCard, Banknote } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="px-6 py-24 md:py-32 lg:py-40 flex flex-col items-center text-center bg-white">
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-slate-900 max-w-4xl mb-6">
          The payments platform built for <span className="text-[#eab308]">Churches & Nonprofits</span>
        </h1>
        <p className="text-lg md:text-xl text-slate-600 max-w-2xl mb-10">
          Secure, transparent, and easy-to-manage donations and payments. Backed by industry-leading security and customized for your ministry's needs.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
          <Link 
            href="/start" 
            className="metallic-gold px-8 py-4 text-sm font-bold rounded-xl shadow-lg transition-all tracking-wide flex items-center justify-center gap-2 text-slate-900"
          >
            Start Onboarding
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link 
            href="/pricing" 
            className="bg-slate-100 text-slate-900 px-8 py-4 text-sm font-bold rounded-xl shadow-sm transition-all hover:bg-slate-200 tracking-wide flex items-center justify-center"
          >
            View Pricing
          </Link>
        </div>
      </section>

      {/* Features Section */}
      <section className="px-6 py-20 bg-slate-50 border-t border-slate-200">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">Everything you need to accept donations</h2>
            <p className="text-slate-600 max-w-2xl mx-auto">Our platform provides all the tools required for a modern giving experience.</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-6">
                <CreditCard className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Accept All Payment Methods</h3>
              <p className="text-slate-600 leading-relaxed">
                Process major credit cards, debit cards, and secure ACH bank transfers with competitive rates.
              </p>
            </div>
            
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
              <div className="w-12 h-12 bg-green-50 text-green-600 rounded-xl flex items-center justify-center mb-6">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Bank-Level Security</h3>
              <p className="text-slate-600 leading-relaxed">
                Your data and transactions are protected by enterprise-grade encryption and PCI compliance.
              </p>
            </div>
            
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
              <div className="w-12 h-12 bg-amber-50 text-[#eab308] rounded-xl flex items-center justify-center mb-6">
                <Banknote className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Transparent Payouts</h3>
              <p className="text-slate-600 leading-relaxed">
                Clear reporting, automated settlements, and a dedicated dashboard to manage your funds easily.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
