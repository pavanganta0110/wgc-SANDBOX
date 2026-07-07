"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

export default function StartOnboardingPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    organizationName: "",
    organizationType: "Church",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    website: "",
  });

  const [legal, setLegal] = useState({
    wgcTerms: false,
    wgcFees: false,
    wgcPrivacy: false,
    finixTerms: false,
    finixPrivacy: false,
  });

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const updateLegal = (field: string, value: boolean) => {
    setLegal((prev) => ({ ...prev, [field]: value }));
  };

  const allLegalAccepted = Object.values(legal).every(Boolean);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allLegalAccepted) {
      toast.error("Please accept all terms and policies to continue.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, legal }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit");

      toast.success("Application started! Redirecting to secure onboarding...");
      
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      } else {
        throw new Error("No redirect URL provided");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "An error occurred");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow max-w-3xl w-full mx-auto py-16 px-6">
        <div className="text-center mb-10">
        <h1 className="text-3xl font-bold text-slate-900 mb-4">Start accepting donations with WGC Payments</h1>
        <p className="text-slate-600">
          WGC Payments helps churches and nonprofits accept donations through our secure payment partner, Finix. To begin, complete the secure onboarding form. Most applications are reviewed within 24–48 hours. After approval, you will receive access to your Finix Sub-Merchant Dashboard where you can manage transactions, payouts, refunds, disputes, and payout bank information.
        </p>
      </div>

      <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Organization Name</label>
              <input
                required
                type="text"
                value={formData.organizationName}
                onChange={(e) => updateField("organizationName", e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-[#eab308] focus:border-[#eab308] outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Organization Type</label>
              <select
                required
                value={formData.organizationType}
                onChange={(e) => updateField("organizationType", e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-[#eab308] focus:border-[#eab308] outline-none bg-white"
              >
                <option>Church</option>
                <option>Nonprofit</option>
                <option>Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Primary Contact Name</label>
              <input
                required
                type="text"
                value={formData.contactName}
                onChange={(e) => updateField("contactName", e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-[#eab308] focus:border-[#eab308] outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Contact Email</label>
              <input
                required
                type="email"
                value={formData.contactEmail}
                onChange={(e) => updateField("contactEmail", e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-[#eab308] focus:border-[#eab308] outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Contact Phone</label>
              <input
                type="tel"
                value={formData.contactPhone}
                onChange={(e) => updateField("contactPhone", e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-[#eab308] focus:border-[#eab308] outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Website (Optional)</label>
              <input
                type="url"
                value={formData.website}
                onChange={(e) => updateField("website", e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-[#eab308] focus:border-[#eab308] outline-none"
                placeholder="https://"
              />
            </div>
          </div>

          <div className="pt-6 border-t border-slate-100">
            <p className="text-sm font-semibold text-slate-900 mb-4">Legal Agreements</p>
            <p className="text-sm text-slate-600 mb-4">
              By continuing, I confirm I am authorized to act on behalf of this organization and agree to the following:
            </p>
            
            <div className="space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={legal.wgcTerms} 
                  onChange={(e) => updateLegal("wgcTerms", e.target.checked)}
                  className="mt-1 w-4 h-4 text-[#eab308] rounded border-slate-300 focus:ring-[#eab308]" 
                />
                <span className="text-sm text-slate-700">WGC Payments <a href="/legal/terms" target="_blank" className="text-blue-600 hover:underline">Terms of Service</a></span>
              </label>
              
              <label className="flex items-start gap-3 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={legal.wgcFees} 
                  onChange={(e) => updateLegal("wgcFees", e.target.checked)}
                  className="mt-1 w-4 h-4 text-[#eab308] rounded border-slate-300 focus:ring-[#eab308]" 
                />
                <span className="text-sm text-slate-700">WGC Payments <a href="/legal/fees" target="_blank" className="text-blue-600 hover:underline">Fee Schedule</a></span>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={legal.wgcPrivacy} 
                  onChange={(e) => updateLegal("wgcPrivacy", e.target.checked)}
                  className="mt-1 w-4 h-4 text-[#eab308] rounded border-slate-300 focus:ring-[#eab308]" 
                />
                <span className="text-sm text-slate-700">WGC Payments <a href="/legal/privacy" target="_blank" className="text-blue-600 hover:underline">Privacy Policy</a></span>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={legal.finixTerms} 
                  onChange={(e) => updateLegal("finixTerms", e.target.checked)}
                  className="mt-1 w-4 h-4 text-[#eab308] rounded border-slate-300 focus:ring-[#eab308]" 
                />
                <span className="text-sm text-slate-700">Finix <a href={process.env.NEXT_PUBLIC_FINIX_TERMS_URL || "https://finix.com/terms"} target="_blank" className="text-blue-600 hover:underline">Terms of Service</a></span>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={legal.finixPrivacy} 
                  onChange={(e) => updateLegal("finixPrivacy", e.target.checked)}
                  className="mt-1 w-4 h-4 text-[#eab308] rounded border-slate-300 focus:ring-[#eab308]" 
                />
                <span className="text-sm text-slate-700">Finix <a href={process.env.NEXT_PUBLIC_FINIX_PRIVACY_URL || "https://finix.com/privacy"} target="_blank" className="text-blue-600 hover:underline">Privacy Policy</a></span>
              </label>
            </div>
          </div>

          <div className="pt-6">
            <button
              type="submit"
              disabled={!allLegalAccepted || isSubmitting}
              className="w-full metallic-gold px-8 py-4 rounded-xl text-slate-900 font-bold shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Continue to Secure Onboarding"}
            </button>
          </div>
        </form>
      </div>
      </main>
      <Footer />
    </div>
  );
}
