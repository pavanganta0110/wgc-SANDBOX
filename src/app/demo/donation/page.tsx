"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { Church, CheckCircle, HelpCircle, Loader2, AlertCircle, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ScrollFade from "@/components/ui/ScrollFade";

const FUNDS = ["General Giving", "Missions", "Global Relief Fund"];
const PRESET_AMOUNTS = [25, 50, 100, 250];

export default function DemoDonationPage() {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [selectedFund, setSelectedFund] = useState(FUNDS[0]);
  const [selectedPreset, setSelectedPreset] = useState<number | null>(100);
  const [customAmount, setCustomAmount] = useState<number | null>(null);

  const [donorName, setDonorName] = useState("");
  const [donorEmail, setDonorEmail] = useState("");

  const [coverFee, setCoverFee] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);

  const [paymentMethod, setPaymentMethod] = useState<"card" | "ach">("card");

  // Card placeholders
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");

  // ACH placeholders
  const [routingNumber, setRoutingNumber] = useState("");
  const [accountNumber, setAccountNumber] = useState("");

  const baseAmount = useMemo(() => {
    return selectedPreset || customAmount || 0;
  }, [selectedPreset, customAmount]);

  const totalAmount = useMemo(() => {
    const base = baseAmount;
    if (coverFee && base > 0) {
      if (paymentMethod === "card") {
        return base + (base * 0.023) + 0.25;
      } else {
        return base + 0.25; // WGC Flat Rate ACH fee 
      }
    }
    return base;
  }, [baseAmount, coverFee, paymentMethod]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const handleCustomAmountChange = (val: string) => {
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0) {
      setCustomAmount(num);
      setSelectedPreset(null);
    } else {
      setCustomAmount(null);
    }
  };

  const submitDonation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (baseAmount > 0 && donorName && donorEmail) {
      setIsLoading(true);
      setErrorMessage(null);

      // Simulate API call
      try {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        setIsLoading(false);
        setIsSubmitted(true);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch (err) {
        setIsLoading(false);
        setErrorMessage("Transaction failed. Please try again with valid demo data.");
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }
  };

  return (
    <>
      <Header />
      <main className="min-h-screen bg-white relative overflow-hidden">
        {/* Premium Background Gradients */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(212,180,106,0.1),transparent_40%),radial-gradient(circle_at_bottom_left,rgba(26,43,74,0.05),transparent_40%)] pointer-events-none" />
        
        {/* Grid Pattern */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none">
          <svg className="w-full h-full" fill="none">
            <pattern id="demo-grid" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="1" />
            </pattern>
            <rect width="100%" height="100%" fill="url(#demo-grid)" />
          </svg>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-24 relative z-10">
          <div className="flex flex-col items-center">
            {/* Demo Header */}
            <div className="text-center mb-16 max-w-2xl">
              <ScrollFade>
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-wgc-gold-500/10 border border-wgc-gold-500/20 text-wgc-gold-600 text-[10px] font-bold tracking-[0.3em] uppercase mb-8 font-mono">
                  Interactive Deployment Environment
                </div>
                <h1 className="text-5xl sm:text-6xl font-bold text-wgc-navy-900 tracking-tight mb-8 leading-tight">
                  Experience the <br />
                  <span className="text-wgc-gold-500 italic">WGC Infrastructure</span>
                </h1>
                <p className="text-wgc-navy-500 text-xl font-medium leading-relaxed tracking-tight opacity-90">
                  See how our white-label giving experience embeds seamlessly into your software, maintaining full brand integrity.
                </p>
              </ScrollFade>
            </div>

        {/* The Giving Card */}
        <div className="bg-white rounded-[3rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.15)] border border-wgc-navy-100/30 overflow-hidden relative ring-1 ring-wgc-navy-50/50">
          <div className="h-1.5 metallic-gold w-full absolute top-0 left-0"></div>
          
          <div className="p-10 lg:p-12">
            {/* Church Identity (White-labeled) */}
            <div className="text-center mb-12">
              <div className="w-20 h-20 rounded-[1.5rem] bg-white flex items-center justify-center text-wgc-gold-500 mx-auto mb-6 shadow-xl relative ring-1 ring-wgc-navy-100">
                 <Church className="w-10 h-10" />
                 <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-lg bg-wgc-gold-500 flex items-center justify-center shadow-lg border border-white">
                    <CheckCircle className="w-4 h-4 text-wgc-navy-900" />
                 </div>
              </div>
              <h2 className="text-2xl font-bold text-wgc-navy-900 tracking-tight">Grace Community Church</h2>
              <p className="text-[10px] font-bold text-wgc-navy-400 uppercase tracking-[0.25em] mt-3 font-mono">White-Label Gift Interface</p>
            </div>

            {!isSubmitted ? (
              <form onSubmit={submitDonation} className="space-y-10">
                {/* Fund Selection */}
                <div>
                  <label className="block text-[10px] font-bold text-wgc-navy-400 uppercase tracking-widest mb-4 ml-1 font-mono">Distribution Fund</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {FUNDS.map((fund) => (
                      <button
                        key={fund}
                        type="button"
                        onClick={() => setSelectedFund(fund)}
                        className={cn(
                          "px-3 py-3 border rounded-xl text-xs font-bold transition-all uppercase tracking-widest",
                          selectedFund === fund
                            ? "bg-white text-wgc-gold-600 border-wgc-navy-900 shadow-lg scale-[1.02]"
                            : "bg-wgc-navy-50/50 text-wgc-navy-400 border-wgc-navy-100/50 hover:bg-wgc-navy-50"
                        )}
                      >
                        {fund}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Amount Selection */}
                <div>
                  <label className="block text-[10px] font-bold text-wgc-navy-400 uppercase tracking-widest mb-4 ml-1 font-mono">Gift Amount</label>
                  <div className="grid grid-cols-4 gap-3 mb-4">
                    {PRESET_AMOUNTS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          setSelectedPreset(preset);
                          setCustomAmount(null);
                        }}
                        className={cn(
                          "px-2 py-4 border rounded-xl font-bold text-lg transition-all text-center tabular-nums tracking-tight",
                          selectedPreset === preset
                            ? "bg-white text-wgc-gold-600 border-wgc-navy-900 shadow-lg scale-[1.02]"
                            : "bg-wgc-navy-50/50 text-wgc-navy-400 border-wgc-navy-100/50 hover:bg-wgc-navy-50"
                        )}
                      >
                        ${preset}
                      </button>
                    ))}
                  </div>
                  
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-6 flex items-center pointer-events-none">
                      <span className="text-wgc-gold-600 font-bold text-2xl group-focus-within:scale-110 transition-transform">$</span>
                    </div>
                    <input
                      type="number"
                      name="custom_amount"
                      id="custom_amount"
                      className="block w-full pl-14 pr-12 text-2xl font-bold text-wgc-navy-900 bg-wgc-navy-50/30 border-wgc-navy-100 rounded-2xl py-5 focus:ring-4 focus:ring-wgc-gold-500/10 focus:border-wgc-gold-500 focus:bg-white transition-all shadow-inner placeholder:text-wgc-navy-300 font-mono"
                      placeholder="Other"
                      value={customAmount || ""}
                      onChange={(e) => handleCustomAmountChange(e.target.value)}
                    />
                  </div>
                </div>

                <hr className="border-wgc-navy-50 my-8" />

                {/* Donor Details */}
                <div>
                  <label className="block text-[10px] font-bold text-wgc-navy-400 uppercase tracking-widest mb-4 ml-1 font-mono">Identity Tokens</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <input
                      type="text"
                      placeholder="Full Name"
                      className="block w-full bg-wgc-navy-50/50 border-wgc-navy-100 rounded-xl py-4 px-5 text-sm font-bold text-wgc-navy-900 focus:outline-none focus:border-wgc-gold-500 transition-all placeholder:text-wgc-navy-400 uppercase"
                      value={donorName}
                      onChange={(e) => setDonorName(e.target.value)}
                      required
                    />
                    <input
                      type="email"
                      placeholder="Email Registry"
                      className="block w-full bg-wgc-navy-50/50 border-wgc-navy-100 rounded-xl py-4 px-5 text-sm font-bold text-wgc-navy-900 focus:outline-none focus:border-wgc-gold-500 transition-all placeholder:text-wgc-navy-400 uppercase"
                      value={donorEmail}
                      onChange={(e) => setDonorEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <hr className="border-wgc-navy-50 my-8" />

                {/* Payment Details */}
                <div>
                  <div className="flex justify-between items-center mb-4 ml-1">
                    <label className="block text-[10px] font-bold text-wgc-navy-400 uppercase tracking-widest font-mono">Instrument Encryption</label>
                    <div className="flex gap-2">
                       <div className="px-2 py-0.5 rounded bg-wgc-navy-50 border border-wgc-navy-100 text-[8px] font-bold text-wgc-navy-400 uppercase tracking-widest font-mono">PCI Level 1</div>
                       {paymentMethod === "ach" && <div className="px-2 py-0.5 rounded bg-green-50 text-green-600 text-[8px] font-bold uppercase tracking-widest border border-green-200 font-mono">Plaid Link</div>}
                    </div>
                  </div>

                  {/* Payment Method Toggle */}
                  <div className="flex p-1.5 bg-wgc-navy-50/70 border border-wgc-navy-100 border-b-0 rounded-t-2xl">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod("card")}
                      className={cn(
                        "flex-1 py-3 text-[10px] sm:text-xs font-bold uppercase tracking-widest rounded-xl border border-transparent transition-all font-mono",
                        paymentMethod === "card" ? "bg-white shadow-sm text-wgc-navy-900 border-wgc-navy-100/50" : "text-wgc-navy-500 hover:text-wgc-navy-700"
                      )}
                    >
                      Credit Card
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod("ach")}
                      className={cn(
                        "flex-1 py-3 text-[10px] sm:text-xs font-bold uppercase tracking-widest rounded-xl border border-transparent transition-all font-mono",
                        paymentMethod === "ach" ? "bg-white shadow-sm text-wgc-navy-900 border-wgc-navy-100/50" : "text-wgc-navy-500 hover:text-wgc-navy-700"
                      )}
                    >
                      Bank Transfer (ACH)
                    </button>
                  </div>
                  
                  {/* Fields */}
                  <div className="shadow-inner border border-wgc-navy-100 rounded-b-2xl rounded-t-none overflow-hidden bg-wgc-navy-50/30 focus-within:ring-2 focus-within:ring-wgc-gold-500/20 focus-within:border-wgc-gold-500 transition-all font-bold">
                    {paymentMethod === "card" ? (
                      <>
                        <input
                          type="text"
                          placeholder="Ministry Card Registry"
                          className="block w-full px-5 py-4 border-b border-wgc-navy-100 sm:text-sm bg-transparent focus:outline-none font-mono text-wgc-navy-900 placeholder:text-wgc-navy-300 uppercase"
                          value={cardNumber}
                          onChange={(e) => setCardNumber(e.target.value)}
                          required
                        />
                        <div className="flex">
                          <input
                            type="text"
                            placeholder="MM / YY"
                            className="block w-1/2 px-5 py-4 border-r border-wgc-navy-100 sm:text-sm bg-transparent focus:outline-none text-wgc-navy-900 placeholder:text-wgc-navy-300 font-mono"
                            value={expiry}
                            onChange={(e) => setExpiry(e.target.value)}
                            required
                          />
                          <input
                            type="password"
                            placeholder="CVC Seal"
                            className="block w-1/2 px-5 py-4 sm:text-sm bg-transparent focus:outline-none text-wgc-navy-900 placeholder:text-wgc-navy-300 font-mono"
                            value={cvc}
                            onChange={(e) => setCvc(e.target.value)}
                            required
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <input
                          type="text"
                          placeholder="Routing Number (9 Digits)"
                          className="block w-full px-5 py-4 border-b border-wgc-navy-100 sm:text-sm bg-transparent focus:outline-none font-mono text-wgc-navy-900 placeholder:text-wgc-navy-300 uppercase"
                          value={routingNumber}
                          onChange={(e) => setRoutingNumber(e.target.value)}
                          required
                        />
                        <input
                          type="password"
                          placeholder="Account Number"
                          className="block w-full px-5 py-4 sm:text-sm bg-transparent focus:outline-none font-mono text-wgc-navy-900 placeholder:text-wgc-navy-300 uppercase"
                          value={accountNumber}
                          onChange={(e) => setAccountNumber(e.target.value)}
                          required
                        />
                      </>
                    )}
                  </div>
                </div>

                {/* Toggles */}
                <div className="space-y-6">
                  <div className="flex items-start group">
                    <input
                      id="cover-fee"
                      type="checkbox"
                      checked={coverFee}
                      onChange={(e) => setCoverFee(e.target.checked)}
                      className="w-5 h-5 mt-1 text-wgc-navy-900 border-wgc-navy-200 rounded-lg focus:ring-wgc-gold-500 cursor-pointer"
                    />
                    <div className="ml-4 text-[13px]">
                      <label htmlFor="cover-fee" className="font-bold text-wgc-navy-900 cursor-pointer group-hover:text-wgc-gold-600 transition-colors tracking-tight">Cover processing fees</label>
                      <p className="text-wgc-navy-400 font-medium leading-relaxed mt-1 tracking-tight opacity-80">Ensure 100% of your {formatCurrency(baseAmount)} reaches the direct mission.</p>
                    </div>
                  </div>
                  <div className="flex items-start group">
                    <input
                      id="recurring"
                      type="checkbox"
                      checked={isRecurring}
                      onChange={(e) => setIsRecurring(e.target.checked)}
                      className="w-5 h-5 mt-1 text-wgc-navy-900 border-wgc-navy-200 rounded-lg focus:ring-wgc-gold-500 cursor-pointer"
                    />
                    <div className="ml-4 text-[13px]">
                      <label htmlFor="recurring" className="font-bold text-wgc-navy-900 cursor-pointer group-hover:text-wgc-gold-600 transition-colors tracking-tight">Start monthly partnership</label>
                    </div>
                  </div>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={baseAmount === 0 || isLoading}
                  className="w-full flex justify-center py-5 px-6 rounded-2xl bg-gradient-to-br from-wgc-gold-500 to-amber-600 shadow-2xl text-lg font-bold text-wgc-navy-900 transform transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:grayscale uppercase tracking-[0.2em] shadow-wgc-gold-500/30"
                >
                  {isLoading ? (
                    <Loader2 className="w-7 h-7 animate-spin" />
                  ) : (
                    `Dispatch ${formatCurrency(totalAmount)}`
                  )}
                </button>
                
                <div className="text-center mt-8 flex items-center justify-center gap-2 text-[10px] font-bold text-wgc-navy-400 uppercase tracking-widest font-mono">
                  <ShieldCheck className="w-3.5 h-3.5 text-green-600" /> Encapsulated Transaction Infrastructure
                </div>
              
                <div className="text-center mt-5 flex items-center justify-center gap-1 text-[10px] text-wgc-navy-400 font-bold uppercase tracking-widest font-mono">
                  <HelpCircle className="w-3 h-3" /> Secure transaction
                </div>
              </form>
            ) : (
              /* Success Screen */
              <div className="text-center py-10 animate-in fade-in zoom-in duration-500">
                <div className="mx-auto flex items-center justify-center h-24 w-24 rounded-[2rem] bg-gradient-to-br from-wgc-gold-500 to-amber-600 mb-12 shadow-2xl relative">
                  <CheckCircle className="w-12 h-12 text-wgc-navy-900" />
                  <div className="absolute inset-0 rounded-[2rem] border-2 border-white/20 animate-ping opacity-20"></div>
                </div>
                
                <h2 className="text-4xl font-bold text-wgc-navy-900 mb-4 tracking-tight">Gift Confirmed.</h2>
                <p className="text-lg font-medium text-wgc-navy-400 mb-10 leading-relaxed tracking-tight opacity-90">
                  Thank you, {donorName || "Partner"}. Your {isRecurring ? "monthly " : ""}contribution of <span className="font-bold text-wgc-navy-900">{formatCurrency(totalAmount)}</span> has been successfully disposed.
                </p>
                
                <div className="bg-wgc-off rounded-[2rem] p-8 mb-12 relative overflow-hidden border border-wgc-gold-500/20 shadow-xl">
                  <div className="absolute inset-0 opacity-[0.03] pointer-events-none">
                    <svg className="h-full w-full" fill="none">
                      <pattern id="thank-you-pattern" x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse">
                        <circle cx="1" cy="1" r="1" className="text-wgc-gold-500" fill="currentColor" />
                      </pattern>
                      <rect width="100%" height="100%" fill="url(#thank-you-pattern)" />
                    </svg>
                  </div>
                  <p className="text-base font-bold text-wgc-navy-900 italic leading-relaxed relative z-10">
                    &quot;Each of you should give what you have decided in your heart to give, not reluctantly or under compulsion, for God loves a cheerful giver.&quot;
                  </p>
                  <p className="text-[10px] text-wgc-gold-600 mt-6 font-bold uppercase tracking-[0.2em] relative z-10 font-mono">— 2 Corinthians 9:7</p>
                </div>
                
                <div className="mt-12 pt-10 border-t border-wgc-navy-50">
                  <p className="text-[10px] font-bold text-wgc-navy-400 uppercase tracking-widest mb-8 font-mono">Deployment Log Verified</p>
                  <Link href="/demo/church-dashboard" className="flex w-full justify-center items-center py-5 px-6 bg-wgc-navy-50 border border-wgc-navy-100 rounded-2xl text-[10px] font-bold text-wgc-navy-900 uppercase tracking-[0.2em] hover:bg-black hover:text-wgc-navy-900 hover:border-black transition-all shadow-sm">
                    Review Ministry Metrics →
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
               <div className="text-center mt-16">
            <p className="text-[10px] font-bold text-wgc-navy-400 uppercase tracking-[0.3em] font-mono mb-8">
              Interested in this infrastructure?
            </p>
            <Link 
              href="/contact" 
              className="inline-flex items-center px-12 py-5 bg-white text-wgc-navy-900 rounded-2xl text-[11px] font-bold uppercase tracking-[0.25em] shadow-2xl shadow-wgc-navy-950/20 hover:bg-black hover:scale-105 active:scale-95 transition-all border border-wgc-navy-100"
            >
              Request Strategic Review
            </Link>
          </div>
        </div>
      </div>
    </main>
      <Footer />

      {isLoading && (
        <div className="fixed inset-0 bg-white/40 backdrop-blur-md z-[100] flex items-center justify-center animate-in fade-in duration-300">
           <div className="text-center bg-white p-12 rounded-[3rem] shadow-2xl border border-wgc-navy-100 max-w-sm mx-4">
             <div className="w-20 h-20 rounded-2xl bg-wgc-gold-500 flex items-center justify-center mx-auto mb-8 shadow-2xl animate-pulse">
               <Loader2 className="w-10 h-10 text-wgc-navy-900 animate-spin" />
             </div>
             <p className="text-wgc-navy-900 font-bold text-2xl tracking-tight mb-2">Processing...</p>
             <p className="text-wgc-gold-600 text-[10px] font-bold uppercase tracking-[0.3em] font-mono">Securing Transaction Environment</p>
           </div>
        </div>
      )}

      {errorMessage && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] w-full max-w-md px-4">
          <div className="p-6 bg-red-600 rounded-3xl shadow-2xl flex gap-4 animate-in slide-in-from-top-8 duration-300 text-wgc-navy-900">
             <AlertCircle className="w-6 h-6 shrink-0" />
             <div>
               <p className="text-sm font-bold uppercase tracking-widest leading-none">Transmission Interrupt</p>
               <p className="text-sm font-medium mt-2 tracking-tight opacity-90">{errorMessage}</p>
               <button onClick={() => setErrorMessage(null)} className="text-[10px] font-bold uppercase tracking-[0.2em] mt-4 hover:underline underline-offset-4 font-mono">Retry Handshake</button>
             </div>
          </div>
        </div>
      )}
    </>
  );
}
