"use client";

import { useState } from "react";
import { Monitor, Smartphone, AlertCircle } from "lucide-react";
import GivingLinkForm from "@/components/giving/GivingLinkForm";
import type { DonorFieldSettings, FrequencyKey, PaymentMethodKey, BrandingModeSettings } from "@/lib/givingLinks/types";

export default function GivingLinkPreviewPanel({
  churchName,
  light,
  amountType,
  fixedAmountCents,
  minAmountCents,
  maxAmountCents,
  suggestedAmountsCents,
  allowCustomAmount,
  recurringEnabled,
  allowedFrequencies,
  allowedPaymentMethods,
  feeCoverEnabled,
  feeCoverDefaultOn,
  donorFieldSettings,
  pricing,
  thankYouMessage,
  campaignImageUrl,
  publicTitle,
  description,
  hideFooter,
}: {
  churchName: string;
  light: BrandingModeSettings;
  amountType: "FIXED" | "VARIABLE";
  fixedAmountCents: number | null;
  minAmountCents: number | null;
  maxAmountCents: number | null;
  suggestedAmountsCents: number[];
  allowCustomAmount: boolean;
  recurringEnabled: boolean;
  allowedFrequencies: FrequencyKey[];
  allowedPaymentMethods: PaymentMethodKey[];
  feeCoverEnabled: boolean;
  feeCoverDefaultOn: boolean;
  donorFieldSettings: DonorFieldSettings;
  pricing: { cardPercentageFee: number | null; cardFixedFeeCents: number | null; achFixedFeeCents: number | null };
  thankYouMessage: string;
  campaignImageUrl?: string;
  publicTitle: string;
  description: string;
  hideFooter: boolean;
}) {
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");
  const [formError, setFormError] = useState(false);
  const [formKey, setFormKey] = useState(0);

  return (
    <div className="lg:sticky lg:top-6 h-fit">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-bold text-slate-900">Live Preview</h4>
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 p-1">
          <button
            onClick={() => setPreviewDevice("desktop")}
            className={`p-1.5 rounded-lg ${previewDevice === "desktop" ? "bg-slate-900 text-white" : "text-slate-500"}`}
            aria-label="Desktop preview"
          >
            <Monitor className="w-4 h-4" />
          </button>
          <button
            onClick={() => setPreviewDevice("mobile")}
            className={`p-1.5 rounded-lg ${previewDevice === "mobile" ? "bg-slate-900 text-white" : "text-slate-500"}`}
            aria-label="Mobile preview"
          >
            <Smartphone className="w-4 h-4" />
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-400 mb-3">
        This renders the actual giving page component in a safe preview mode — no real payment, donation, or receipt is ever created here.
      </p>

      {/* Mobile preview uses a real narrow viewport container (not a scaled-down desktop frame) so responsive Tailwind breakpoints inside the shared form actually engage. */}
      <div
        className={`mx-auto border border-slate-200 rounded-2xl overflow-hidden bg-slate-50 transition-all ${
          previewDevice === "mobile" ? "w-[375px]" : "w-full"
        }`}
      >
        <div className="overflow-y-auto max-h-[720px] py-8 px-4" style={{ backgroundColor: light.pageBackground }}>
          {formError ? (
            <div className="max-w-md mx-auto bg-white rounded-2xl border border-red-100 p-8 text-center">
              <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-900 mb-1">Preview couldn't load</p>
              <p className="text-xs text-slate-500 mb-4">The secure payment form failed to load. Your unsaved settings are safe.</p>
              <button
                onClick={() => {
                  setFormError(false);
                  setFormKey((k) => k + 1);
                }}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold"
              >
                Retry
              </button>
            </div>
          ) : (
            <div
              className="max-w-md mx-auto bg-white rounded-2xl shadow-sm border p-8"
              style={{ borderColor: light.borderColor, backgroundColor: light.headerBackground }}
            >
              {campaignImageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={campaignImageUrl} alt="" className="w-full h-32 object-cover rounded-xl mb-6" />
              )}
              <h1 className="text-lg font-bold text-center mb-1" style={{ color: light.headingColor }}>
                {publicTitle || "Your Giving Link Title"}
              </h1>
              {description && (
                <p className="text-sm text-center mb-6" style={{ color: light.bodyTextColor }}>
                  {description}
                </p>
              )}

              <GivingLinkForm
                key={formKey}
                slug="preview"
                finixMerchantId=""
                churchName={churchName}
                light={light}
                amountType={amountType}
                fixedAmountCents={fixedAmountCents}
                minAmountCents={minAmountCents}
                maxAmountCents={maxAmountCents}
                suggestedAmountsCents={suggestedAmountsCents}
                allowCustomAmount={allowCustomAmount}
                recurringEnabled={recurringEnabled}
                allowedFrequencies={allowedFrequencies}
                allowedPaymentMethods={allowedPaymentMethods}
                feeCoverEnabled={feeCoverEnabled}
                feeCoverDefaultOn={feeCoverDefaultOn}
                donorFieldSettings={donorFieldSettings}
                pricing={pricing}
                thankYouMessage={thankYouMessage}
                googlePayGatewayMerchantId={null}
                googlePayMerchantId={null}
                googlePayEnvironment="TEST"
                previewMode
                onFormError={() => setFormError(true)}
              />

              {!hideFooter && <p className="text-center text-xs text-slate-300 mt-6">Powered by WGC Payments</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
