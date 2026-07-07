"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { 
  Building2, 
  UserCircle, 
  ShieldCheck, 
  FileText, 
  CheckCircle2, 
  ChevronRight, 
  ChevronLeft,
  Upload,
  Loader2,
  Info
} from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: 1, label: "Organization", icon: Building2 },
  { id: 2, label: "Representative", icon: UserCircle },
  { id: 3, label: "Processing", icon: ShieldCheck },
  { id: 4, label: "Documents", icon: FileText },
  { id: 5, label: "Review", icon: CheckCircle2 },
];

export default function OnboardingForm() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Form State
  const [formData, setFormData] = useState({
    // Step 1: Org
    legalName: "",
    dbaName: "",
    entityType: "Church",
    ein: "",
    stateOfFormation: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    website: "",
    primaryContactName: "",
    primaryContactEmail: "",
    primaryContactPhone: "",
    
    // Step 2: Rep
    repName: "",
    repTitle: "",
    repDob: "",
    repSsnLast4: "",
    repEmail: "",
    repPhone: "",
    repAddress: "",
    
    // Step 3: Risk
    mission: "",
    useCase: "Donations",
    monthlyVolume: "",
    avgTx: "",
    maxTx: "",
    fundingSource: "",
    acceptAch: true,
    acceptCard: true,
    recurring: true,
    textToGive: false,
  });

  const updateField = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const nextStep = () => setCurrentStep(prev => Math.min(prev + 1, STEPS.length));
  const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 1));

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/onboarding/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) throw new Error("Failed to submit application");

      router.push("/dashboard/church/onboarding/status");
    } catch (err) {
      console.error(err);
      toast.error("Error submitting application. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-12 max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8 font-sans">
      
      {/* Sidebar Stepper */}
      <div className="lg:w-80 space-y-4">
        <div className="bg-wgc-navy-900 rounded-[2.5rem] p-10 shadow-2xl border border-white/5 relative overflow-hidden">
           <div className="absolute top-0 right-0 w-32 h-32 bg-wgc-gold-500/10 blur-3xl rounded-full"></div>
           <h2 className="text-xl font-bold text-white mb-8 tracking-tight relative z-10">Application Steps</h2>
           <div className="space-y-6 relative z-10">
              {STEPS.map((step) => (
                <div key={step.id} className="flex items-center gap-4 group cursor-pointer" onClick={() => step.id < currentStep && setCurrentStep(step.id)}>
                   <div className={cn(
                     "w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-500",
                     currentStep === step.id ? "bg-wgc-gold-500 text-wgc-navy-900 shadow-[0_0_20px_rgba(234,179,8,0.3)] scale-110" : 
                     currentStep > step.id ? "bg-green-500/20 text-green-500 border border-green-500/30" : "bg-white/5 text-white/30 border border-white/10 group-hover:bg-white/10"
                   )}>
                      {currentStep > step.id ? <CheckCircle2 className="w-5 h-5" /> : <step.icon className="w-5 h-5" />}
                   </div>
                   <div className="flex flex-col">
                      <span className={cn(
                        "text-[10px] font-bold uppercase tracking-widest font-mono",
                        currentStep === step.id ? "text-wgc-gold-500" : "text-white/40"
                      )}>Step 0{step.id}</span>
                      <span className={cn(
                        "text-sm font-bold tracking-tight transition-colors",
                        currentStep === step.id ? "text-white" : "text-white/60 group-hover:text-white"
                      )}>{step.label}</span>
                   </div>
                </div>
              ))}
           </div>
           
           <div className="mt-12 pt-8 border-t border-white/10">
              <div className="flex items-center gap-2 mb-4">
                 <ShieldCheck className="w-4 h-4 text-wgc-gold-500" />
                 <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest font-mono">Secure Compliance</span>
              </div>
              <p className="text-[10px] font-medium text-white/30 leading-relaxed italic">
                 WGC uses end-to-end encryption for all KYB/KYC data handling.
              </p>
           </div>
        </div>

        {/* Progress Card */}
        <div className="bg-white rounded-[2rem] p-8 border border-slate-100 shadow-sm">
           <div className="flex justify-between items-center mb-4">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Completion</span>
              <span className="text-sm font-bold text-wgc-navy-900 font-mono">{Math.round((currentStep / STEPS.length) * 100)}%</span>
           </div>
           <div className="w-full h-2 bg-slate-50 rounded-full overflow-hidden border border-slate-100">
              <div 
                className="h-full bg-gradient-to-r from-wgc-gold-500 to-amber-600 transition-all duration-1000" 
                style={{ width: `${(currentStep / STEPS.length) * 100}%` }}
              ></div>
           </div>
        </div>
      </div>

      {/* Form Area */}
      <div className="flex-1">
        <div className="bg-white rounded-[3rem] p-8 md:p-12 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.05)] border border-slate-100 min-h-[600px] flex flex-col">
           
           {/* Step Content */}
           <div className="flex-1 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {currentStep === 1 && (
                <div className="space-y-10">
                   <div>
                      <h3 className="text-3xl font-bold text-wgc-navy-900 tracking-tight mb-2">Organization Details</h3>
                      <p className="text-sm text-slate-500 font-medium tracking-tight">Provide the legal information for your church or nonprofit entity.</p>
                   </div>
                   
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="col-span-full">
                         <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-3 font-mono">Legal Organization Name</label>
                         <input 
                           value={formData.legalName}
                           onChange={(e) => updateField("legalName", e.target.value)}
                           className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-[1.25rem] focus:ring-2 focus:ring-wgc-gold-500/20 focus:border-wgc-gold-500 focus:outline-none transition-all font-medium text-slate-900"
                           placeholder="Church Name Inc."
                         />
                      </div>
                      <div>
                         <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-3 font-mono">DBA / Public Name</label>
                         <input 
                           value={formData.dbaName}
                           onChange={(e) => updateField("dbaName", e.target.value)}
                           className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-[1.25rem] focus:ring-2 focus:ring-wgc-gold-500/20 focus:border-wgc-gold-500 focus:outline-none transition-all font-medium text-slate-900"
                           placeholder="Grace Fellowship"
                         />
                      </div>
                      <div>
                         <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-3 font-mono">Entity Type</label>
                         <select 
                           value={formData.entityType}
                           onChange={(e) => updateField("entityType", e.target.value)}
                           className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-[1.25rem] focus:ring-2 focus:ring-wgc-gold-500/20 focus:border-wgc-gold-500 focus:outline-none transition-all font-medium text-slate-900 appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2020%2020%22%3E%3Cpath%20stroke%3D%22%2364748b%22%20stroke-width%3D%221.5%22%20d%3D%22m6%208%204%204%204-4%22%2F%3E%3C%2Fsvg%3E')] bg-[length:1.25rem_1.25rem] bg-[right_1rem_center] bg-no-repeat"
                         >
                            <option>Church</option>
                            <option>Nonprofit</option>
                            <option>501(c)(3)</option>
                            <option>Religious Organization</option>
                            <option>Other</option>
                         </select>
                      </div>
                      <div>
                         <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-3 font-mono">EIN / Tax ID</label>
                         <input 
                           value={formData.ein}
                           onChange={(e) => updateField("ein", e.target.value)}
                           className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-[1.25rem] focus:ring-2 focus:ring-wgc-gold-500/20 focus:border-wgc-gold-500 focus:outline-none transition-all font-medium text-slate-900"
                           placeholder="12-3456789"
                         />
                      </div>
                      <div>
                         <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-3 font-mono">State of Formation</label>
                         <input 
                           value={formData.stateOfFormation}
                           onChange={(e) => updateField("stateOfFormation", e.target.value)}
                           className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-[1.25rem] focus:ring-2 focus:ring-wgc-gold-500/20 focus:border-wgc-gold-500 focus:outline-none transition-all font-medium text-slate-900"
                           placeholder="Texas"
                         />
                      </div>
                   </div>
                </div>
              )}

              {currentStep === 2 && (
                <div className="space-y-10">
                   <div>
                      <h3 className="text-3xl font-bold text-wgc-navy-900 tracking-tight mb-2">Authorized Representative</h3>
                      <p className="text-sm text-slate-500 font-medium tracking-tight">Identity verification for the person controlling the merchant account.</p>
                   </div>
                   
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="col-span-full">
                         <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-3 font-mono">Full Legal Name</label>
                         <input 
                           value={formData.repName}
                           onChange={(e) => updateField("repName", e.target.value)}
                           className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-[1.25rem] focus:ring-2 focus:ring-wgc-gold-500/20 focus:border-wgc-gold-500 focus:outline-none transition-all font-medium text-slate-900"
                           placeholder="Johnathan Mark Doe"
                         />
                      </div>
                      <div>
                         <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-3 font-mono">Title / Role</label>
                         <input 
                           value={formData.repTitle}
                           onChange={(e) => updateField("repTitle", e.target.value)}
                           className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-[1.25rem] focus:ring-2 focus:ring-wgc-gold-500/20 focus:border-wgc-gold-500 focus:outline-none transition-all font-medium text-slate-900"
                           placeholder="Executive Pastor / Treasurer"
                         />
                      </div>
                      <div>
                         <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-3 font-mono">SSN / ITIN (Last 4)</label>
                         <input 
                           value={formData.repSsnLast4}
                           onChange={(e) => updateField("repSsnLast4", e.target.value)}
                           className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-[1.25rem] focus:ring-2 focus:ring-wgc-gold-500/20 focus:border-wgc-gold-500 focus:outline-none transition-all font-medium text-slate-900"
                           placeholder="1234"
                           maxLength={4}
                         />
                      </div>
                   </div>
                   
                   <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 flex gap-4">
                      <Info className="w-5 h-5 text-wgc-navy-400 shrink-0" />
                      <p className="text-[11px] font-medium text-slate-500 leading-relaxed italic">
                         We are required by federal law (FinCEN) to collect information on individuals with significant control over the organization. This data is encrypted and used only for verification.
                      </p>
                   </div>
                </div>
              )}

              {currentStep === 3 && (
                <div className="space-y-10">
                   <div>
                      <h3 className="text-3xl font-bold text-wgc-navy-900 tracking-tight mb-2">Processing Profile</h3>
                      <p className="text-sm text-slate-500 font-medium tracking-tight">Tell us about your donation volume and use cases.</p>
                   </div>
                   
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div>
                         <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-3 font-mono">Estimated Monthly Volume</label>
                         <input 
                           type="number"
                           value={formData.monthlyVolume}
                           onChange={(e) => updateField("monthlyVolume", e.target.value)}
                           className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-[1.25rem] focus:ring-2 focus:ring-wgc-gold-500/20 focus:border-wgc-gold-500 focus:outline-none transition-all font-medium text-slate-900"
                           placeholder="50000"
                         />
                      </div>
                      <div>
                         <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-3 font-mono">Average Transaction</label>
                         <input 
                           type="number"
                           value={formData.avgTx}
                           onChange={(e) => updateField("avgTx", e.target.value)}
                           className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-[1.25rem] focus:ring-2 focus:ring-wgc-gold-500/20 focus:border-wgc-gold-500 focus:outline-none transition-all font-medium text-slate-900"
                           placeholder="250"
                         />
                      </div>
                      
                      <div className="col-span-full space-y-6 pt-4">
                         <h4 className="text-[10px] font-bold text-wgc-navy-900 uppercase tracking-widest font-mono border-b border-slate-100 pb-2">Enabled Rails</h4>
                         <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {[
                              { id: "acceptAch", label: "Accept ACH", icon: Building2 },
                              { id: "acceptCard", label: "Accept Card", icon: ShieldCheck },
                              { id: "recurring", label: "Recurring", icon: ChevronRight },
                              { id: "textToGive", label: "Text-to-Give", icon: FileText },
                            ].map(item => (
                              <button 
                                key={item.id}
                                onClick={() => updateField(item.id, !formData[item.id as keyof typeof formData])}
                                className={cn(
                                  "p-4 rounded-2xl border text-center transition-all group",
                                  formData[item.id as keyof typeof formData] ? "bg-wgc-gold-50 border-wgc-gold-500/30 text-wgc-gold-600 shadow-sm" : "bg-white border-slate-100 text-slate-400 grayscale opacity-50"
                                )}
                              >
                                 <span className="text-[9px] font-black uppercase tracking-widest font-mono">{item.label}</span>
                              </button>
                            ))}
                         </div>
                      </div>
                   </div>
                </div>
              )}

              {currentStep === 4 && (
                <div className="space-y-10">
                   <div>
                      <h3 className="text-3xl font-bold text-wgc-navy-900 tracking-tight mb-2">Document Verification</h3>
                      <p className="text-sm text-slate-500 font-medium tracking-tight">Upload required documentation to verify your tax-exempt status.</p>
                   </div>
                   
                   <div className="space-y-6">
                      {[
                        "IRS Determination Letter",
                        "Government Issued ID",
                        "Voided Check / Bank Letter"
                      ].map(doc => (
                        <div key={doc} className="p-8 border-2 border-dashed border-slate-100 rounded-[2rem] flex flex-col items-center justify-center gap-4 hover:border-wgc-gold-500/40 hover:bg-slate-50/50 transition-all cursor-pointer group">
                           <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-white group-hover:text-wgc-gold-500 shadow-sm transition-all">
                              <Upload className="w-6 h-6" />
                           </div>
                           <div className="text-center">
                              <div className="text-sm font-bold text-wgc-navy-900 tracking-tight">{doc}</div>
                              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono mt-1">PDF, JPG or PNG (Max 5MB)</div>
                           </div>
                        </div>
                      ))}
                   </div>
                </div>
              )}

              {currentStep === 5 && (
                <div className="space-y-10">
                   <div>
                      <h3 className="text-3xl font-bold text-wgc-navy-900 tracking-tight mb-2">Review & Submit</h3>
                      <p className="text-sm text-slate-500 font-medium tracking-tight">Verify all information before initiating the underwriting protocol.</p>
                   </div>
                   
                   <div className="bg-slate-950 rounded-[2.5rem] p-10 border border-white/5 shadow-2xl relative overflow-hidden group">
                      <div className="absolute -right-20 -bottom-20 w-64 h-64 bg-wgc-gold-500/10 blur-[80px] rounded-full pointer-events-none group-hover:bg-wgc-gold-500/20 transition-all duration-1000"></div>
                      
                      <div className="space-y-8 relative z-10">
                         <div className="flex justify-between items-center border-b border-white/10 pb-6">
                            <div className="flex flex-col">
                               <span className="text-[10px] font-bold text-wgc-gold-500 uppercase tracking-widest font-mono">Entity</span>
                               <span className="text-lg font-bold text-white tracking-tight">{formData.legalName || "No Name Provided"}</span>
                            </div>
                            <button onClick={() => setCurrentStep(1)} className="text-[10px] font-bold text-white/40 uppercase tracking-widest font-mono hover:text-white transition-colors">Edit</button>
                         </div>
                         
                         <div className="flex justify-between items-center border-b border-white/10 pb-6">
                            <div className="flex flex-col">
                               <span className="text-[10px] font-bold text-wgc-gold-500 uppercase tracking-widest font-mono">Representative</span>
                               <span className="text-lg font-bold text-white tracking-tight">{formData.repName || "No Representative"}</span>
                            </div>
                            <button onClick={() => setCurrentStep(2)} className="text-[10px] font-bold text-white/40 uppercase tracking-widest font-mono hover:text-white transition-colors">Edit</button>
                         </div>

                         <div className="flex items-center gap-4 p-6 bg-white/5 rounded-2xl border border-white/10">
                            <div className="w-10 h-10 rounded-xl bg-wgc-gold-500/20 flex items-center justify-center text-wgc-gold-500 border border-wgc-gold-500/20">
                               <ShieldCheck className="w-5 h-5" />
                            </div>
                            <p className="text-[11px] font-medium text-white/60 leading-relaxed italic">
                               By submitting, you agree to our merchant services agreement and authorize WGC Payments to perform necessary KYB/KYC checks.
                            </p>
                         </div>
                      </div>
                   </div>
                </div>
              )}
           </div>

           {/* Navigation Buttons */}
           <div className="mt-12 flex justify-between items-center pt-8 border-t border-slate-50">
              <button 
                onClick={prevStep}
                disabled={currentStep === 1}
                className={cn(
                  "flex items-center px-8 py-4 rounded-2xl text-[10px] font-bold uppercase tracking-widest font-mono transition-all",
                  currentStep === 1 ? "opacity-0 pointer-events-none" : "bg-slate-50 text-wgc-navy-400 hover:bg-slate-100"
                )}
              >
                <ChevronLeft className="w-4 h-4 mr-2" /> Back
              </button>
              
              {currentStep < STEPS.length ? (
                <button 
                  onClick={nextStep}
                  className="flex items-center px-10 py-4 bg-wgc-navy-900 text-white rounded-2xl text-[10px] font-bold uppercase tracking-widest font-mono shadow-xl hover:bg-black transform transition-all active:scale-95"
                >
                  Continue <ChevronRight className="w-4 h-4 ml-2" />
                </button>
              ) : (
                <button 
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="flex items-center px-12 py-4 bg-gradient-to-br from-wgc-gold-500 to-amber-600 text-wgc-navy-900 rounded-2xl text-[10px] font-bold uppercase tracking-widest font-mono shadow-[0_20px_40px_rgba(234,179,8,0.2)] transform transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit Application"}
                </button>
              )}
           </div>
        </div>
      </div>
    </div>
  );
}
