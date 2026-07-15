"use client";

import { useEffect, useRef, useState } from "react";
import { X, CheckCircle, AlertCircle, ChevronDown } from "lucide-react";
import toast from "react-hot-toast";
import { getFraudSessionId } from "@/lib/finix/fraudSession";
import { mountFinixPaymentForm } from "@/lib/finix/tokenize";
import { calculateWgcFeeAmounts } from "@/lib/giving/feeCalculator";
import { formatCents } from "@/lib/format";
import { validateGoodsServicesInput, computeRecordedContributionAmountCents } from "@/lib/giving/goodsServices";
import { DEFAULT_NO_GOODS_SERVICES_TEXT, DEFAULT_GOODS_SERVICES_TEMPLATE } from "@/lib/settings/acknowledgmentDefaults";
import type { FinixPaymentFormInstance } from "@/lib/finix/fraudSession";

const APPLICATION_ID = process.env.NEXT_PUBLIC_FINIX_APPLICATION_ID || "";

type Step = "form" | "review" | "processing" | "result";

interface PaymentResult {
  success: boolean;
  transferId?: string;
  state?: string;
  error?: string;
}

export default function TakePaymentDialog({
  finixMerchantId,
  churchName,
  pricing,
  onClose,
}: {
  finixMerchantId: string;
  churchName: string;
  pricing: { cardPercentageFee: number | null; cardFixedFeeCents: number | null; achFixedFeeCents: number | null };
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>("form");
  const [result, setResult] = useState<PaymentResult | null>(null);

  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"card" | "bank">("card");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [fundName, setFundName] = useState("");
  const [note, setNote] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [coverFees, setCoverFees] = useState(false);
  const [formReady, setFormReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [goodsServicesOpen, setGoodsServicesOpen] = useState(false);
  const [goodsServicesProvided, setGoodsServicesProvided] = useState(false);
  const [goodsServicesDescription, setGoodsServicesDescription] = useState("");
  const [goodsServicesFairMarketValue, setGoodsServicesFairMarketValue] = useState("");
  const [goodsServicesInternalNote, setGoodsServicesInternalNote] = useState("");
  const [confirmAccurate, setConfirmAccurate] = useState(false);

  const formInstanceRef = useRef<FinixPaymentFormInstance | null>(null);
  const clientAttemptIdRef = useRef(crypto.randomUUID());

  useEffect(() => {
    if (!APPLICATION_ID) return;
    let cancelled = false;

    const container = document.getElementById("take-payment-finix-form");
    if (container) container.innerHTML = "";
    formInstanceRef.current = null;
    setFormReady(false);

    mountFinixPaymentForm("take-payment-finix-form", APPLICATION_ID, {
      paymentMethods: [paymentMethod],
      showAddress: false,
    })
      .then((instance) => {
        if (cancelled) return;
        formInstanceRef.current = instance;
        setFormReady(true);
      })
      .catch(() => {
        if (!cancelled) toast.error("Could not load the payment form. Please refresh and try again.");
      });

    return () => {
      cancelled = true;
    };
  }, [paymentMethod]);

  const amountCents = Math.round((parseFloat(amount) || 0) * 100);
  const feeResult = calculateWgcFeeAmounts({
    donationAmountCents: amountCents || 0,
    paymentMethod: paymentMethod === "bank" ? "ACH" : "CARD",
    cardBrand: null,
    donorCoversFee: coverFees,
  });
  
  const totalCents = coverFees ? feeResult.amountToChargeCents : (amountCents || 0);
  const feeCoveredCents = coverFees ? feeResult.supplementalFeeCents : 0;

  const goodsServicesFairMarketValueCents = goodsServicesFairMarketValue.trim() ? Math.round((parseFloat(goodsServicesFairMarketValue) || 0) * 100) : null;
  const goodsServicesValidation = validateGoodsServicesInput(
    { provided: goodsServicesProvided, description: goodsServicesDescription, fairMarketValueCents: goodsServicesFairMarketValueCents },
    amountCents,
  );
  const recordedContributionAmountCents = goodsServicesProvided
    ? computeRecordedContributionAmountCents(amountCents, goodsServicesFairMarketValueCents ?? 0)
    : amountCents;
  const acknowledgmentPreviewText = goodsServicesProvided
    ? DEFAULT_GOODS_SERVICES_TEMPLATE.replace(/\[DESCRIPTION\]/g, goodsServicesDescription.trim() || "—").replace(
        /\[VALUE\]/g,
        formatCents(goodsServicesFairMarketValueCents ?? 0),
      )
    : DEFAULT_NO_GOODS_SERVICES_TEXT;

  const canSubmit = formReady && !submitting && amountCents >= 100 && name.trim() && email.trim();
  const canProceedToReview = canSubmit && goodsServicesValidation.valid;

  const proceedToReview = () => {
    if (!canProceedToReview) {
      if (!goodsServicesValidation.valid) setGoodsServicesOpen(true);
      return;
    }
    setStep("review");
  };

  const handleSubmit = async () => {
    if (!canProceedToReview || !confirmAccurate) return;
    setSubmitting(true);

    try {
      const fraudSessionId = await getFraudSessionId(finixMerchantId);

      const tokenPromise = new Promise<{ tokenId: string; instrumentType: string }>((resolve, reject) => {
        formInstanceRef.current!.submit((error, response) => {
          if (error || !response?.data?.id) {
            reject(new Error("Payment information could not be tokenized. Please check the details and try again."));
            return;
          }
          resolve({ tokenId: response.data.id, instrumentType: response.data.instrument_type || "PAYMENT_CARD" });
        });
      });

      const { tokenId } = await tokenPromise;

      const res = await fetch("/api/merchant/transactions/payments/take-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: tokenId,
          donationAmountCents: amountCents,
          coverFees,
          paymentMethod,
          fraudSessionId,
          clientAttemptId: clientAttemptIdRef.current,
          donor: { name: name.trim(), email: email.trim(), phone: phone.trim() || undefined },
          fundName: fundName.trim() || undefined,
          note: note.trim() || undefined,
          isAnonymous,
          goodsServicesProvided,
          goodsServicesDescription: goodsServicesProvided ? goodsServicesDescription.trim() : undefined,
          goodsServicesFairMarketValueCents: goodsServicesProvided ? goodsServicesFairMarketValueCents : undefined,
          goodsServicesInternalNote: goodsServicesInternalNote.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setResult({ success: false, error: data.error || "Payment failed" });
        setStep("result");
        return;
      }

      setResult({ success: true, transferId: data.transferId, state: data.state });
      setStep("result");
    } catch (err: any) {
      setResult({ success: false, error: err?.message || "Payment could not be processed" });
      setStep("result");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetry = () => {
    clientAttemptIdRef.current = crypto.randomUUID();
    setResult(null);
    setConfirmAccurate(false);
    setStep("form");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 overflow-y-auto py-8">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">Take a Payment</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {step === "form" && (
          <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Amount ($) *</label>
              <input
                type="number"
                step="0.01"
                min="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Donor Name *</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="First Last"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Donor Email *</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="donor@example.com"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Donor Phone</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Fund / Designation</label>
                <input
                  value={fundName}
                  onChange={(e) => setFundName(e.target.value)}
                  placeholder="General, Building, Missions…"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Note</label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional note for this payment"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-2">Payment Method</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setPaymentMethod("card")}
                  className={`flex-1 px-3 py-2 rounded-lg border text-sm font-semibold transition-colors ${
                    paymentMethod === "card"
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  Card
                </button>
                <button
                  onClick={() => setPaymentMethod("bank")}
                  className={`flex-1 px-3 py-2 rounded-lg border text-sm font-semibold transition-colors ${
                    paymentMethod === "bank"
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  Bank Account
                </button>
              </div>
            </div>

            <div
              id="take-payment-finix-form"
              className="min-h-[120px] rounded-lg border border-slate-200 p-3"
            />

            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={coverFees} onChange={(e) => setCoverFees(e.target.checked)} />
                Donor covers processing fees
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={isAnonymous} onChange={(e) => setIsAnonymous(e.target.checked)} />
                Anonymous gift
              </label>
            </div>

            {amountCents >= 100 && (
              <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600 space-y-1">
                <div className="flex justify-between">
                  <span>Gift amount</span>
                  <span className="font-semibold text-slate-900">{formatCents(amountCents)}</span>
                </div>
                {coverFees && feeCoveredCents > 0 && (
                  <div className="flex justify-between">
                    <span>Processing fee covered</span>
                    <span className="text-slate-500">+{formatCents(feeCoveredCents)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-slate-200 pt-1 mt-1">
                  <span className="font-semibold">Total charged</span>
                  <span className="font-bold text-slate-900">{formatCents(totalCents)}</span>
                </div>
              </div>
            )}

            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <button
                type="button"
                onClick={() => setGoodsServicesOpen((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100"
              >
                <span>Goods or Services</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${goodsServicesOpen ? "rotate-180" : ""}`} />
              </button>
              {goodsServicesOpen && (
                <div className="p-4 space-y-3">
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="radio" name="goodsServices" checked={!goodsServicesProvided} onChange={() => setGoodsServicesProvided(false)} />
                      No goods or services were provided
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="radio" name="goodsServices" checked={goodsServicesProvided} onChange={() => setGoodsServicesProvided(true)} />
                      Goods or services were provided
                    </label>
                  </div>

                  {goodsServicesProvided && (
                    <div className="space-y-3 pt-1">
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">Description of Goods or Services *</label>
                        <input
                          value={goodsServicesDescription}
                          onChange={(e) => setGoodsServicesDescription(e.target.value)}
                          placeholder="Dinner ticket and event admission"
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {goodsServicesValidation.errors.description && (
                          <p className="text-xs text-red-600 mt-1">{goodsServicesValidation.errors.description}</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">Estimated Fair Market Value ($) *</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={goodsServicesFairMarketValue}
                          onChange={(e) => setGoodsServicesFairMarketValue(e.target.value)}
                          placeholder="35.00"
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {goodsServicesValidation.errors.fairMarketValueCents && (
                          <p className="text-xs text-red-600 mt-1">{goodsServicesValidation.errors.fairMarketValueCents}</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">Internal Note (optional)</label>
                        <input
                          value={goodsServicesInternalNote}
                          onChange={(e) => setGoodsServicesInternalNote(e.target.value)}
                          placeholder="Not shown on the donor receipt"
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      {amountCents >= 100 && (
                        <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600 space-y-1">
                          <div className="flex justify-between">
                            <span>Payment Amount</span>
                            <span className="font-semibold text-slate-900">{formatCents(amountCents)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Estimated Value of Goods/Services</span>
                            <span className="text-slate-500">-{formatCents(goodsServicesFairMarketValueCents ?? 0)}</span>
                          </div>
                          <div className="flex justify-between border-t border-slate-200 pt-1 mt-1">
                            <span className="font-semibold">Recorded Contribution Amount</span>
                            <span className="font-bold text-slate-900">{formatCents(recordedContributionAmountCents)}</span>
                          </div>
                        </div>
                      )}
                      <p className="text-[11px] text-slate-400">
                        This calculation is for acknowledgment and record-keeping purposes only. The organization is responsible for confirming the
                        correct fair market value.
                      </p>
                    </div>
                  )}

                  <p className="text-xs text-slate-500 italic pt-1">"{acknowledgmentPreviewText}"</p>
                </div>
              )}
            </div>

            <button
              onClick={proceedToReview}
              disabled={!canProceedToReview}
              className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Continue to Review
            </button>
          </div>
        )}

        {step === "review" && (
          <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
            <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700 space-y-2">
              <div className="flex justify-between"><span className="text-slate-500">Donor</span><span className="font-semibold">{name}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Payment Amount</span><span className="font-semibold">{formatCents(amountCents)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Payment Method</span><span className="font-semibold">{paymentMethod === "card" ? "Card" : "Bank Account"}</span></div>
              {fundName.trim() && <div className="flex justify-between"><span className="text-slate-500">Fund/Campaign</span><span className="font-semibold">{fundName.trim()}</span></div>}
              <div className="flex justify-between">
                <span className="text-slate-500">Goods or Services</span>
                <span className="font-semibold">{goodsServicesProvided ? "Provided" : "None Provided"}</span>
              </div>
              {goodsServicesProvided && (
                <>
                  <div className="flex justify-between"><span className="text-slate-500">Description</span><span className="font-semibold text-right max-w-[60%]">{goodsServicesDescription}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Fair Market Value</span><span className="font-semibold">{formatCents(goodsServicesFairMarketValueCents ?? 0)}</span></div>
                  <div className="flex justify-between border-t border-slate-200 pt-2 mt-1"><span className="text-slate-500">Recorded Contribution Amount</span><span className="font-bold">{formatCents(recordedContributionAmountCents)}</span></div>
                </>
              )}
              <div className="pt-2 border-t border-slate-200">
                <p className="text-xs text-slate-500 mb-1">Receipt Acknowledgment</p>
                <p className="text-xs italic">"{acknowledgmentPreviewText}"</p>
              </div>
            </div>

            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={confirmAccurate} onChange={(e) => setConfirmAccurate(e.target.checked)} className="mt-0.5" />
              I confirm that the entered information is accurate.
            </label>

            <div className="flex gap-2">
              <button
                onClick={() => setStep("form")}
                className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={!confirmAccurate || submitting}
                className="flex-1 py-3 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? "Processing…" : `Charge ${formatCents(totalCents)}`}
              </button>
            </div>
          </div>
        )}

        {step === "processing" && (
          <div className="px-6 py-12 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-sm text-slate-500">Processing payment…</p>
          </div>
        )}

        {step === "result" && result && (
          <div className="px-6 py-8 text-center space-y-4">
            {result.success ? (
              <>
                <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
                <h3 className="text-lg font-bold text-slate-900">Payment Submitted</h3>
                <p className="text-sm text-slate-500">
                  {formatCents(totalCents)} charged to {name}. Status: {(result.state || "PENDING").toUpperCase()}
                </p>
                {result.transferId && (
                  <p className="text-xs text-slate-400 font-mono">{result.transferId}</p>
                )}
                <div className="flex gap-2 justify-center pt-2">
                  <button
                    onClick={onClose}
                    className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
                  >
                    Done
                  </button>
                  <button
                    onClick={handleRetry}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Take Another Payment
                  </button>
                </div>
              </>
            ) : (
              <>
                <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
                <h3 className="text-lg font-bold text-slate-900">Payment Failed</h3>
                <p className="text-sm text-red-600">{result.error}</p>
                <div className="flex gap-2 justify-center pt-2">
                  <button
                    onClick={handleRetry}
                    className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
                  >
                    Try Again
                  </button>
                  <button
                    onClick={onClose}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
