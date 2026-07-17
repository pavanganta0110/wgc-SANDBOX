import Link from "next/link";
import { ArrowLeft, CreditCard, Banknote, ShieldAlert, RotateCcw } from "lucide-react";
import GatewayIcon from "@/components/ui/GatewayIcon";

export default function FeesPage() {
  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <div className="max-w-4xl mx-auto px-4 py-20">
        
        {/* Header */}
        <div className="mb-12">
           <Link href="/" className="inline-block mb-10 group">
              <div className="flex items-center gap-2">
                <GatewayIcon className="h-10 w-auto transition-transform group-hover:scale-105 duration-500" />
                <span className="font-black text-wgc-navy-900 uppercase tracking-tighter text-2xl">WGC Payments</span>
              </div>
           </Link>
           <h1 className="text-4xl font-bold text-wgc-navy-900 tracking-tight">Fee Schedule</h1>
        </div>

        {/* Content */}
        <div className="bg-white rounded-[3rem] p-10 md:p-16 border shadow-[0_32px_64px_-16px_rgba(0,0,0,0.05)] relative overflow-hidden">
          
          <div className="relative z-10 text-slate-600 leading-relaxed space-y-8">
            <p className="text-lg">
              WGC Payments offers church, nonprofit, other 501(c) organization, or client-specific pricing for donation processing and platform access.
            </p>
            <p>
              Unless otherwise agreed in writing, standard pricing may be:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-8">
              <div className="border border-slate-100 bg-slate-50 rounded-2xl p-6 hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
                <div className="w-12 h-12 bg-wgc-navy-50 rounded-xl flex items-center justify-center mb-4 text-wgc-navy-600">
                  <CreditCard className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-wgc-navy-900 mb-2">Card Donations</h3>
                <p className="text-3xl font-black text-wgc-navy-900 tracking-tight mb-2">up to 2.3%<span className="text-lg text-slate-400 font-medium ml-1">+ $0.25</span></p>
                <p className="text-sm text-slate-500">per transaction</p>
                <p className="text-[11px] text-slate-400 mt-3 border-t border-slate-200/50 pt-2 font-medium">American Express (AMEX) cards are processed at 3.5% + $0.25</p>
              </div>

              <div className="border border-slate-100 bg-slate-50 rounded-2xl p-6 hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
                <div className="w-12 h-12 bg-wgc-navy-50 rounded-xl flex items-center justify-center mb-4 text-wgc-navy-600">
                  <Banknote className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-wgc-navy-900 mb-2">ACH / eCheck Donations</h3>
                <p className="text-3xl font-black text-wgc-navy-900 tracking-tight mb-2">$0.25</p>
                <p className="text-sm text-slate-500">flat per transfer</p>
              </div>
            </div>

            <div className="border border-slate-100 bg-slate-50 rounded-2xl p-6 mb-8 flex items-start gap-4">
               <div className="w-10 h-10 bg-wgc-navy-50 rounded-xl flex items-center justify-center shrink-0 text-wgc-navy-600">
                  <ShieldAlert className="w-5 h-5" />
               </div>
               <div>
                 <h3 className="text-lg font-bold text-wgc-navy-900 mb-1">Base Protocol / Platform Access</h3>
                 <p className="text-slate-600 font-medium">$10 per month per active merchant.</p>
               </div>
            </div>

            <p>
              These rates may vary by church/nonprofit/501(c) organization/client agreement, transaction type, payment method, processing configuration, and volume. As volume and processing efficiency increase, pricing may be reduced. Fees are not increased without prior notice or agreement.
            </p>
            
            <p>
              Additional fees may apply for refunds, ACH returns, disputes, chargebacks, network assessments, processor costs, financial institution costs, reserve requirements, or other pass-through charges.
            </p>
            
            <p>
              WGC may deduct application/platform fees from processed donations through its payment processor. Monthly platform fees may be billed separately.
            </p>
            
            <p className="font-bold text-wgc-navy-900">
              Final pricing for each church/nonprofit/501(c) organization/client is provided during onboarding or in their WGC Payments agreement.
            </p>
            
            <hr className="my-10 border-slate-100" />
            
            <div className="bg-slate-50 rounded-xl p-6 text-sm text-slate-500">
              <h4 className="font-bold text-slate-700 mb-2">Common Operational Fees (Standard)</h4>
              <ul className="space-y-2">
                <li className="flex items-center gap-2"><RotateCcw className="w-4 h-4 text-slate-400" /> <strong>Disputes / Chargebacks:</strong> $15.00 per instance</li>
                <li className="flex items-center gap-2"><RotateCcw className="w-4 h-4 text-slate-400" /> <strong>ACH Returns:</strong> $4.00 per return</li>
              </ul>
            </div>

            <p className="text-xs text-slate-400 text-right">Last updated July 2026.</p>
            
          </div>

          {/* Background branding */}
          <div className="absolute -right-20 -bottom-20 opacity-[0.02] pointer-events-none select-none text-[12rem] font-black text-wgc-navy-900 leading-none">FEES</div>
        </div>
        
        <div className="mt-12 text-center">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-wgc-navy-900 transition-colors uppercase tracking-widest font-mono">
            <ArrowLeft className="w-4 h-4" /> Back to Home
          </Link>
        </div>
        
      </div>
    </div>
  );
}
