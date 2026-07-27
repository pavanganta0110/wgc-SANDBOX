"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { trackMetaEvent } from "@/components/common/MetaPixel";

type FirstLookFormData = {
  firstName: string;
  lastName: string;
  email: string;
  organization: string;
  role: string;
  annualGiving: string;
  preferredTime: string;
  painPoint?: string;
  // Honeypot
  addressLine3?: string;
};

const ROLES = [
  "Pastor",
  "Executive Pastor",
  "Church Administrator",
  "Finance Committee / Treasurer",
  "Nonprofit Executive Director",
  "Development / Advancement",
  "Other",
];

const GIVING_RANGES = [
  "Under $120K",
  "$120K – $250K",
  "$250K – $500K",
  "$500K+",
];

const PREFERRED_TIMES = [
  "Tuesday morning",
  "Tuesday evening",
  "Thursday midday",
  "Thursday evening",
  "Flexible",
];

export default function FirstLookForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [metaEventId, setMetaEventId] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FirstLookFormData>();

  useEffect(() => {
    // Generate a unique ID for Meta deduplication on mount
    setMetaEventId(crypto.randomUUID());
  }, []);

  const onSubmit = async (data: FirstLookFormData) => {
    // Honeypot check
    if (data.addressLine3) {
      // Silently fail for bots
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const urlParams = new URLSearchParams(window.location.search);
      
      const payload = {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        organization: data.organization,
        role: data.role,
        annualGiving: data.annualGiving,
        preferredTime: data.preferredTime,
        painPoint: data.painPoint || "",
        honeypot: data.addressLine3,
        source: "first-look-landing",
        referrer: document.referrer,
        utmSource: urlParams.get("utm_source"),
        utmMedium: urlParams.get("utm_medium"),
        utmCampaign: urlParams.get("utm_campaign"),
        utmContent: urlParams.get("utm_content"),
        utmTerm: urlParams.get("utm_term"),
        landingPageUrl: window.location.href,
        metaEventId,
      };

      const res = await fetch("/api/first-look/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await res.json();

      if (!res.ok || !result.success) {
        throw new Error(result.error || "We couldn't save your registration. Please try again.");
      }

      // Fire Meta Pixel event
      trackMetaEvent("Lead", { content_name: "First Look Registration" }, metaEventId);

      // Redirect to confirmation page
      router.push(`/first-look/confirmed?ref=${result.registrationReference}`);
    } catch (err: any) {
      console.error("Registration error:", err);
      setSubmitError("We couldn’t save your registration. Please try again.");
      setIsSubmitting(false);
    }
  };

  const inputClass = "w-full bg-[#E8E0CF] border border-[rgba(20,33,61,0.13)] rounded-[3px] px-3 py-2 text-[#14213D] text-sm focus:outline-none focus:ring-1 focus:ring-[#C9992E] focus:border-[#C9992E]";
  const labelClass = "block text-[11px] uppercase tracking-wider font-mono text-[#41506F] font-semibold mb-1";

  return (
    <div className="bg-[#FFFDF8] rounded-[3px] border border-[rgba(20,33,61,0.13)] p-6 md:p-8 w-full max-w-[600px] mx-auto shadow-sm" id="join">
      <div className="mb-6">
        <span className="inline-block text-[11px] uppercase font-mono font-bold text-[#8C5A33] mb-2 tracking-widest border-b-2 border-[#C9992E] pb-0.5">Save your seat</span>
        <h2 className="text-3xl md:text-4xl font-serif text-[#14213D] leading-tight mb-2">Join the First Look list.</h2>
        <p className="text-[#41506F] text-sm md:text-base leading-relaxed">
          We're locking the session schedule based on what works for the people on this list. Tell us when you can make it and we'll send the invite.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Honeypot */}
        <div aria-hidden="true" className="hidden absolute left-[-9999px]">
          <input type="text" tabIndex={-1} autoComplete="off" {...register("addressLine3")} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>First name</label>
            <input 
              type="text" 
              className={inputClass}
              {...register("firstName", { required: "First name is required" })} 
              aria-invalid={errors.firstName ? "true" : "false"}
            />
            {errors.firstName && <span className="text-red-600 text-xs mt-1 block">{errors.firstName.message}</span>}
          </div>
          <div>
            <label className={labelClass}>Last name</label>
            <input 
              type="text" 
              className={inputClass}
              {...register("lastName", { required: "Last name is required" })} 
            />
            {errors.lastName && <span className="text-red-600 text-xs mt-1 block">{errors.lastName.message}</span>}
          </div>
        </div>

        <div>
          <label className={labelClass}>Email</label>
          <input 
            type="email" 
            className={inputClass}
            {...register("email", { 
              required: "Email is required",
              pattern: {
                value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                message: "Please enter a valid email"
              }
            })} 
          />
          {errors.email && <span className="text-red-600 text-xs mt-1 block">{errors.email.message}</span>}
        </div>

        <div>
          <label className={labelClass}>Church or organization</label>
          <input 
            type="text" 
            className={inputClass}
            {...register("organization", { required: "Organization is required" })} 
          />
          {errors.organization && <span className="text-red-600 text-xs mt-1 block">{errors.organization.message}</span>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Your role</label>
            <select 
              className={inputClass}
              {...register("role", { required: "Role is required" })}
            >
              <option value="">Select a role...</option>
              {ROLES.map(role => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
            {errors.role && <span className="text-red-600 text-xs mt-1 block">{errors.role.message}</span>}
          </div>
          <div>
            <label className={labelClass}>Annual giving or revenue</label>
            <select 
              className={inputClass}
              {...register("annualGiving", { required: "Annual giving is required" })}
            >
              <option value="">Select a range...</option>
              {GIVING_RANGES.map(range => (
                <option key={range} value={range}>{range}</option>
              ))}
            </select>
            {errors.annualGiving && <span className="text-red-600 text-xs mt-1 block">{errors.annualGiving.message}</span>}
          </div>
        </div>

        <div>
          <label className={labelClass}>Best time for a live session</label>
          <select 
            className={inputClass}
            {...register("preferredTime", { required: "Preferred time is required" })}
          >
            <option value="">Select a time...</option>
            {PREFERRED_TIMES.map(time => (
              <option key={time} value={time}>{time}</option>
            ))}
          </select>
          {errors.preferredTime && <span className="text-red-600 text-xs mt-1 block">{errors.preferredTime.message}</span>}
        </div>

        <div>
          <label className={labelClass}>What's the one thing your current giving platform can't do? (Optional)</label>
          <textarea 
            rows={3}
            className={`${inputClass} resize-none`}
            {...register("painPoint")}
          ></textarea>
        </div>

        {submitError && (
          <div aria-live="polite" className="bg-red-50 text-red-700 p-3 rounded text-sm border border-red-200">
            {submitError}
          </div>
        )}

        <div className="pt-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-[#C9992E] hover:bg-[#b08320] text-white font-bold py-3.5 px-4 rounded-[3px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            {isSubmitting ? "Saving your seat..." : "Save my seat"}
          </button>
          <p className="text-center text-[#41506F] text-[11px] mt-3">
            No cost, no pitch deck. We'll email you the schedule once it's set.
          </p>
        </div>
      </form>
    </div>
  );
}
