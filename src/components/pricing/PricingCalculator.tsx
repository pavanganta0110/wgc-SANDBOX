"use client";

import { useState, useMemo } from "react";
import { Calculator } from "lucide-react";

export default function PricingCalculator() {
  const [monthlyVolume, setMonthlyVolume] = useState(50000);
  const [avgDonation, setAvgDonation] = useState(150);
  const [currentRatePct, setCurrentRatePct] = useState(2.9);
  const [currentRateFixed, setCurrentRateFixed] = useState(0.30);
  const [currentMonthlyFee, setCurrentMonthlyFee] = useState(49);
  const [achPercentage, setAchPercentage] = useState(15);

  // WGC Constants
  const wgcRatePct = 2.3;
  const wgcRateFixed = 0.25;
  const wgcAchFixed = 0.25; 
  const wgcMonthlyFee = 10;

  const calculations = useMemo(() => {
    const totalTransactions = Math.max(1, Math.round(monthlyVolume / Math.max(1, avgDonation)));
    const achTransactions = Math.round(totalTransactions * (achPercentage / 100));
    const cardTransactions = totalTransactions - achTransactions;

    const achVolume = achTransactions * avgDonation;
    const cardVolume = cardTransactions * avgDonation;

    // Competitor cost
    const currentVolumeCost = monthlyVolume * (currentRatePct / 100);
    const currentFixedTxCost = totalTransactions * currentRateFixed;
    const currentTotalCost = currentVolumeCost + currentFixedTxCost + currentMonthlyFee;

    // WGC cost
    const wgcCardCost = (cardVolume * (wgcRatePct / 100)) + (cardTransactions * wgcRateFixed);
    const wgcAchCost = achTransactions * wgcAchFixed;
    const wgcTotalCost = wgcCardCost + wgcAchCost + wgcMonthlyFee;

    const monthlySavings = Math.max(0, currentTotalCost - wgcTotalCost);
    const annualSavings = monthlySavings * 12;

    return {
      currentTotalCost,
      wgcTotalCost,
      monthlySavings,
      annualSavings,
      totalTransactions,
    };
  }, [monthlyVolume, avgDonation, currentRatePct, currentRateFixed, currentMonthlyFee, achPercentage]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(val);
  };

  return (
    <div id="calculator" className="grid lg:grid-cols-12 gap-0 bg-white rounded-[3rem] border border-wgc-navy-100 shadow-2xl overflow-hidden">
      {/* Calculator Inputs */}
      <div className="lg:col-span-7 p-10 lg:p-14 bg-wgc-off/30">
        <h3 className="text-xl font-black text-wgc-navy-900 mb-10 tracking-tight underline decoration-wgc-gold-500 decoration-4 underline-offset-8 uppercase">Current setup</h3>
        
        <div className="space-y-10">
          <div className="grid sm:grid-cols-2 gap-8">
            <div>
              <label className="block text-[10px] font-black text-wgc-navy-400 uppercase tracking-widest mb-3">Monthly Volume ($)</label>
              <input 
                type="number" 
                value={monthlyVolume} 
                onChange={(e) => setMonthlyVolume(Number(e.target.value))}
                className="w-full px-5 py-4 bg-white border border-wgc-navy-200 rounded-2xl text-wgc-navy-900 focus:ring-2 focus:ring-wgc-gold-500 focus:border-wgc-gold-500 transition-all font-bold shadow-sm" 
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-wgc-navy-400 uppercase tracking-widest mb-3">Avg. Donation ($)</label>
              <input 
                type="number" 
                value={avgDonation} 
                onChange={(e) => setAvgDonation(Number(e.target.value))}
                className="w-full px-5 py-4 bg-white border border-wgc-navy-200 rounded-2xl text-wgc-navy-900 focus:ring-2 focus:ring-wgc-gold-500 focus:border-wgc-gold-500 transition-all font-bold shadow-sm" 
              />
            </div>
          </div>

          <div>
            <h4 className="text-[10px] font-black text-wgc-navy-400 mb-6 flex items-center gap-3 uppercase tracking-widest">
              Processing Rates <div className="flex-1 h-px bg-wgc-navy-100"></div>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div>
                <label className="block text-[9px] font-black text-wgc-navy-600 uppercase tracking-widest mb-3">Card Rate (%)</label>
                <input 
                  type="number" 
                  step="0.1" 
                  value={currentRatePct} 
                  onChange={(e) => setCurrentRatePct(Number(e.target.value))}
                  className="w-full px-5 py-3 bg-white border border-wgc-navy-200 rounded-xl text-sm text-wgc-navy-900 font-bold focus:ring-2 focus:ring-wgc-gold-500 transition-all" 
                />
              </div>
              <div>
                <label className="block text-[9px] font-black text-wgc-navy-600 uppercase tracking-widest mb-3">Fixed Fee ($)</label>
                <input 
                  type="number" 
                  step="0.05" 
                  value={currentRateFixed} 
                  onChange={(e) => setCurrentRateFixed(Number(e.target.value))}
                  className="w-full px-5 py-3 bg-white border border-wgc-navy-200 rounded-xl text-sm text-wgc-navy-900 font-bold focus:ring-2 focus:ring-wgc-gold-500 transition-all" 
                />
              </div>
              <div>
                <label className="block text-[9px] font-black text-wgc-navy-600 uppercase tracking-widest mb-3">Monthly ($)</label>
                <input 
                  type="number" 
                  value={currentMonthlyFee} 
                  onChange={(e) => setCurrentMonthlyFee(Number(e.target.value))}
                  className="w-full px-5 py-3 bg-white border border-wgc-navy-200 rounded-xl text-sm text-wgc-navy-900 font-bold focus:ring-2 focus:ring-wgc-gold-500 transition-all" 
                />
              </div>
            </div>
          </div>

          <div className="pt-4">
             <label className="flex justify-between items-center mb-6">
                <span className="block text-[10px] font-black text-wgc-navy-400 uppercase tracking-widest">ACH Donations (%)</span>
                <span className="text-sm font-black text-wgc-gold-600 bg-wgc-gold-50 px-3 py-1 rounded-full">{achPercentage}%</span>
             </label>
             <input 
              type="range" 
              min="0" 
              max="100" 
              value={achPercentage} 
              onChange={(e) => setAchPercentage(Number(e.target.value))}
              className="w-full h-3 bg-wgc-navy-100 rounded-full appearance-none cursor-pointer accent-wgc-gold-500 mb-4" 
             />
             <p className="text-[11px] text-wgc-navy-500 font-medium italic">Most churches find scaling ACH volume is the single fastest way to reduce overhead.</p>
          </div>
        </div>
      </div>

      {/* Calculator Output Area */}
      <div className="lg:col-span-5 bg-wgc-off text-wgc-navy-900 p-10 lg:p-14 flex flex-col justify-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 pointer-events-none">
           <svg className="h-full w-full" fill="none">
             <pattern id="calculator-pattern-next" x="0" y="0" width="30" height="30" patternUnits="userSpaceOnUse">
               <path d="M 30 0 L 0 0 0 30" fill="none" stroke="white" strokeWidth="0.5"/>
             </pattern>
             <rect width="100%" height="100%" fill="url(#calculator-pattern-next)" />
           </svg>
        </div>
        <div className="relative z-10">
          <div className="mb-10 p-8 rounded-3xl border border-wgc-navy-100 shadow-2xl relative overflow-hidden" style={{ background: "rgba(255,255,255,0.03)" }}>
            <div className="absolute -bottom-8 -right-8 opacity-10 text-8xl font-black text-wgc-gold-500 pointer-events-none italic uppercase -rotate-12">SAVED</div>
            <p className="text-[10px] font-black text-wgc-navy-400 uppercase tracking-[0.3em] mb-3">Est. Annual Savings</p>
            <div className="text-6xl font-black text-wgc-gold-500 tracking-tighter">{formatCurrency(calculations.annualSavings)}</div>
            <div className="mt-4 flex items-center gap-3">
              <div className="w-8 h-1 bg-wgc-gold-500 rounded-full"></div>
              <p className="text-sm font-bold text-wgc-navy-900">{formatCurrency(calculations.monthlySavings)} savings / month</p>
            </div>
          </div>

          <div className="space-y-6">
             <div className="flex justify-between items-center pb-5 border-b border-wgc-navy-100">
               <span className="text-sm font-bold text-wgc-navy-400">Competitor cost / mo</span>
               <span className="text-lg font-black text-wgc-navy-900">{formatCurrency(calculations.currentTotalCost)}</span>
             </div>
             <div className="flex justify-between items-center pb-5 border-b border-wgc-navy-100">
               <span className="text-sm font-bold text-wgc-navy-400">WGC cost / mo</span>
               <span className="text-2xl font-black text-wgc-navy-900">{formatCurrency(calculations.wgcTotalCost)}</span>
             </div>
             <div className="pt-4 flex justify-between text-[10px] font-black uppercase tracking-widest text-wgc-navy-400">
               <span>~{calculations.totalTransactions.toLocaleString()} monthly gift transactions</span>
             </div>
          </div>
          
          <div className="mt-12 text-center">
             <p className="text-[11px] font-bold text-wgc-navy-400 uppercase tracking-widest">Based on mission-aligned infrastructure.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
