"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { trackMetaEvent } from "@/components/common/MetaPixel";

export default function FirstLookPreferencesForm() {
  const searchParams = useSearchParams();
  const publicReference = searchParams.get("ref");
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<"IDLE" | "SUCCESS" | "ERROR">("IDLE");
  const [preference, setPreference] = useState<"OPTED_IN" | "SESSION_ONLY">("OPTED_IN");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publicReference) return;
    
    setIsSubmitting(true);
    setStatus("IDLE");

    try {
      const res = await fetch("/api/first-look/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicReference, buildUpdatesPreference: preference }),
      });

      const result = await res.json();

      if (!res.ok || !result.success) {
        throw new Error(result.error || "Failed to update preferences");
      }

      if (preference === "OPTED_IN") {
        trackMetaEvent("BuildUpdatesOptIn", { content_name: "First Look Build Updates" });
      }

      setStatus("SUCCESS");
    } catch (err) {
      console.error(err);
      setStatus("ERROR");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!publicReference) {
    return null;
  }

  if (status === "SUCCESS") {
    return (
      <div className="bg-[#E8E0CF] rounded-[3px] border border-[rgba(20,33,61,0.13)] p-6 md:p-8 w-full max-w-[600px] mx-auto text-center">
        <h3 className="font-serif text-2xl text-[#14213D] mb-2">Preferences saved.</h3>
        <p className="text-[#41506F]">We've updated your email preferences. We'll be in touch soon.</p>
      </div>
    );
  }

  return (
    <div className="bg-[#FFFDF8] rounded-[3px] border border-[rgba(20,33,61,0.13)] p-6 md:p-8 w-full max-w-[600px] mx-auto shadow-sm">
      <h3 className="font-serif text-2xl text-[#14213D] mb-2">One last thing.</h3>
      <p className="text-[#41506F] text-sm md:text-base leading-relaxed mb-6">
        We're sending weekly, plain-text emails on exactly what we're building, what's breaking, and the decisions we're making behind the scenes. 
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-3">
          <label className="flex items-start gap-3 cursor-pointer p-3 rounded hover:bg-[#F5F1E8] transition-colors border border-transparent hover:border-[rgba(20,33,61,0.1)]">
            <input 
              type="radio" 
              name="preference" 
              value="OPTED_IN"
              checked={preference === "OPTED_IN"}
              onChange={() => setPreference("OPTED_IN")}
              className="mt-1 w-4 h-4 text-[#C9992E] focus:ring-[#C9992E]"
            />
            <div>
              <span className="block font-bold text-[#14213D]">Send me the weekly build updates</span>
              <span className="block text-sm text-[#41506F]">I want to see how this gets built from the inside.</span>
            </div>
          </label>
          
          <label className="flex items-start gap-3 cursor-pointer p-3 rounded hover:bg-[#F5F1E8] transition-colors border border-transparent hover:border-[rgba(20,33,61,0.1)]">
            <input 
              type="radio" 
              name="preference" 
              value="SESSION_ONLY"
              checked={preference === "SESSION_ONLY"}
              onChange={() => setPreference("SESSION_ONLY")}
              className="mt-1 w-4 h-4 text-[#C9992E] focus:ring-[#C9992E]"
            />
            <div>
              <span className="block font-bold text-[#14213D]">Session updates only</span>
              <span className="block text-sm text-[#41506F]">Just email me when the live session schedule is set.</span>
            </div>
          </label>
        </div>

        {status === "ERROR" && (
          <div aria-live="polite" className="bg-red-50 text-red-700 p-3 rounded text-sm border border-red-200">
            We couldn't save your preferences. Please try again.
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-[#14213D] hover:bg-[#203154] text-white font-bold py-3.5 px-4 rounded-[3px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          {isSubmitting ? "Saving..." : "Save Preferences"}
        </button>
      </form>
    </div>
  );
}
