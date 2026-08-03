"use client";

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { CheckCircle2, Clock, ShieldCheck } from "lucide-react";
import { mountFinixPaymentForm } from "@/lib/finix/tokenize";
import type { FinixPaymentFormInstance } from "@/lib/finix/fraudSession";
import { getFraudSessionId } from "@/lib/finix/fraudSession";
import { formatCents } from "@/lib/format";
import { isApplePayAvailable, loadApplePayButtonScript, beginApplePaySession, type ApplePayResult } from "@/lib/finix/wallets/applePay";
import { isGooglePayAvailable, createGooglePayButton, requestGooglePayment, type GooglePayResult } from "@/lib/finix/wallets/googlePay";

interface LineItem {
  description: string;
  detailedDescription: string | null;
  quantity: number;
  unitPriceCents: number;
  discountAppliedCents: number;
  taxAmountCents: number;
  totalCents: number;
}

interface InvoiceData {
  invoiceNumber: string;
  status: string;
  issueDate: string;
  dueDate: string;
  title: string | null;
  clientName: string;
  lineItems: LineItem[];
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  serviceFeeCents: number;
  totalCents: number;
  amountPaidCents: number;
  balanceCents: number;
  classification: string;
  clientMemo: string | null;
  paymentInstructions: string | null;
  termsAndConditions: string | null;
  allowCard: boolean;
  allowAch: boolean;
  allowApplePay: boolean;
  allowGooglePay: boolean;
  allowPartialPayments: boolean;
  minimumPartialPaymentCents: number | null;
  feeCoveredBy: string;
  paymentHistory: { date: string; method: string; grossAmountCents: number; refundedCents: number; status: string }[];
  branding: {
    logoUrl: string | null;
    organizationDisplayName: string;
    accentColor: string;
    footerMessage: string | null;
    thankYouMessage: string | null;
  };
  churchName: string;
  finixMerchantId: string | null;
  finixApplicationId: string | null;
  finixEnvironment: "sandbox" | "live";
  googlePayGatewayMerchantId: string | null;
  googlePayMerchantId: string | null;
  googlePayEnvironment: "TEST" | "PRODUCTION";
}

type ViewState =
  | { step: "loading" }
  | { step: "error"; message: string }
  | { step: "ready"; data: InvoiceData }
  | { step: "paid"; data: InvoiceData };

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SCHEDULED: "Scheduled",
  SENT: "Sent",
  VIEWED: "Viewed",
  PARTIALLY_PAID: "Partially Paid",
  PAID: "Paid",
  PAST_DUE: "Past Due",
  VOID: "Void",
  UNCOLLECTIBLE: "Uncollectible",
};

export default function InvoicePublicView({ token }: { token: string }) {
  const [state, setState] = useState<ViewState>({ step: "loading" });
  const [payAmountInput, setPayAmountInput] = useState("");
  const [payMethod, setPayMethod] = useState<"card" | "bank">("card");
  const [payerName, setPayerName] = useState("");
  const [payerEmail, setPayerEmail] = useState("");
  const [payerPhone, setPayerPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [walletProcessing, setWalletProcessing] = useState<"apple_pay" | "google_pay" | null>(null);
  const [attemptId, setAttemptId] = useState("");
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [googleAvailable, setGoogleAvailable] = useState(false);

  const formInstanceRef = useRef<FinixPaymentFormInstance | null>(null);
  const [formReady, setFormReady] = useState(false);
  const applePayButtonRef = useRef<HTMLDivElement>(null);
  const googlePayButtonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setAttemptId(crypto.randomUUID());
    let cancelled = false;
    fetch(`/api/invoice/${token}`)
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setState({ step: "error", message: json.error || "This invoice could not be loaded." });
          return;
        }
        setState({ step: "ready", data: json });
      })
      .catch(() => {
        if (!cancelled) setState({ step: "error", message: "A network error occurred. Please refresh and try again." });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const data = state.step === "ready" ? state.data : null;

  useEffect(() => {
    if (!data?.finixApplicationId) return;
    // The #invoice-finix-form target only exists in the DOM when the
    // invoice can still accept payment (see the `canPay` render guard
    // below) — without this check, an invoice that's already PAID (e.g.
    // reached zero balance in this same session) throws "element must be
    // an HTMLElement" from Finix.PaymentForm since the div was never
    // rendered.
    const canStillPay = data.status !== "VOID" && data.status !== "DRAFT" && data.status !== "SCHEDULED" && data.status !== "UNCOLLECTIBLE" && data.balanceCents > 0;
    if (!canStillPay) return;
    let cancelled = false;
    setFormReady(false);
    mountFinixPaymentForm("invoice-finix-form", data.finixApplicationId, { paymentMethods: [payMethod], showAddress: false }, data.finixEnvironment)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.finixApplicationId, payMethod]);

  useEffect(() => {
    setAppleAvailable(false);
    if (!data?.allowApplePay || !data.finixMerchantId) return;
    if (!isApplePayAvailable()) return;
    setAppleAvailable(true);
    loadApplePayButtonScript().catch(() => {});
  }, [data?.allowApplePay, data?.finixMerchantId]);

  useEffect(() => {
    setGoogleAvailable(false);
    if (!data?.allowGooglePay || !data.googlePayGatewayMerchantId) return;
    let cancelled = false;
    isGooglePayAvailable({
      environment: data.googlePayEnvironment,
      gatewayMerchantId: data.googlePayGatewayMerchantId,
      merchantId: data.googlePayMerchantId || undefined,
      merchantName: data.churchName,
    }).then((available) => {
      if (!cancelled && available) setGoogleAvailable(true);
    });
    return () => {
      cancelled = true;
    };
  }, [data?.allowGooglePay, data?.googlePayGatewayMerchantId, data?.googlePayEnvironment, data?.googlePayMerchantId, data?.churchName]);

  // Stored in refs (mirrors GivingLinkForm.tsx) since the click is bound via
  // a native addEventListener / Google's own createButton callback, not
  // React's onClick — a plain function reference captured once would close
  // over stale state (payAmountInput, payerName, etc. at mount time).
  const handleApplePayClickRef = useRef<() => void>(() => {});
  const handleGooglePayClickRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!appleAvailable) return;
    const el = applePayButtonRef.current;
    if (!el) return;
    const onClick = () => handleApplePayClickRef.current();
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, [appleAvailable]);

  useEffect(() => {
    if (!googleAvailable || !data?.googlePayGatewayMerchantId) return;
    let cancelled = false;
    const config = {
      environment: data.googlePayEnvironment,
      gatewayMerchantId: data.googlePayGatewayMerchantId,
      merchantId: data.googlePayMerchantId || undefined,
      merchantName: data.churchName,
    };
    createGooglePayButton(config, () => handleGooglePayClickRef.current()).then((button) => {
      if (cancelled || !googlePayButtonRef.current) return;
      googlePayButtonRef.current.innerHTML = "";
      googlePayButtonRef.current.appendChild(button);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleAvailable]);

  if (state.step === "loading") {
    return <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">Loading invoice…</div>;
  }
  if (state.step === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-slate-50">
        <div className="max-w-md text-center bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          <h1 className="text-xl font-bold text-slate-900 mb-2">Invoice unavailable</h1>
          <p className="text-sm text-slate-500">{state.message}</p>
        </div>
      </div>
    );
  }
  if (state.step === "paid") {
    const paidData = state.data;
    const paidAccent = paidData.branding.accentColor || "#1d4ed8";
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-slate-50">
        <div className="max-w-md text-center bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          <CheckCircle2 className="w-12 h-12 mx-auto mb-3" style={{ color: paidAccent }} />
          <h1 className="text-xl font-bold text-slate-900 mb-2">Payment Successful</h1>
          <p className="text-sm text-slate-500">{paidData.branding.thankYouMessage || `Thank you for your payment to ${paidData.branding.organizationDisplayName}.`}</p>
        </div>
      </div>
    );
  }
  if (!data) return null;

  const accent = data.branding.accentColor || "#1d4ed8";
  const requestedAmountCents = data.allowPartialPayments
    ? Math.round((parseFloat(payAmountInput || "0") || 0) * 100)
    : data.balanceCents;

  function validateAmount(): string | null {
    if (!data) return "Invoice not loaded.";
    if (requestedAmountCents < 100) return "Please enter an amount of at least $1.00.";
    if (requestedAmountCents > data.balanceCents) return "The amount cannot exceed the remaining balance.";
    if (data.allowPartialPayments && requestedAmountCents < data.balanceCents && data.minimumPartialPaymentCents && requestedAmountCents < data.minimumPartialPaymentCents) {
      return `The minimum partial payment is ${formatCents(data.minimumPartialPaymentCents)}.`;
    }
    return null;
  }

  function validatePayer(): string | null {
    if (!payerName.trim() || !payerEmail.trim()) return "Please enter your name and email.";
    return null;
  }

  async function submitPayment(payload: Record<string, unknown>) {
    const res = await fetch(`/api/invoice/${token}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) {
      throw new Error(json?.message || "We couldn't complete your payment. Please try again.");
    }
    return json;
  }

  const handleCardBankSubmit = async () => {
    const amountError = validateAmount();
    if (amountError) {
      toast.error(amountError);
      return;
    }
    const payerError = validatePayer();
    if (payerError) {
      toast.error(payerError);
      return;
    }
    if (!formInstanceRef.current || !formReady) {
      toast.error("Payment form is still loading — please wait a moment.");
      return;
    }
    if (!data.finixMerchantId) {
      toast.error("This organization is not set up to accept payments.");
      return;
    }

    setSubmitting(true);
    let fraudSessionId = "";
    if (payMethod === "card") {
      try {
        fraudSessionId = await getFraudSessionId(data.finixMerchantId);
      } catch {
        toast.error("Could not start a secure payment session. Please try again.");
        setSubmitting(false);
        return;
      }
    }

    formInstanceRef.current.submit(async (error, response) => {
      if (error || !response?.data?.id) {
        toast.error("Could not process your payment details. Please check your card/bank info.");
        setSubmitting(false);
        return;
      }
      try {
        await submitPayment({
          amountCents: requestedAmountCents,
          paymentMethod: payMethod,
          finixToken: response.data.id,
          fraudSessionId,
          clientAttemptId: attemptId,
          payer: { name: payerName.trim(), email: payerEmail.trim(), phone: payerPhone.trim() || undefined },
        });
        setState({ step: "paid", data });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Payment failed.");
      } finally {
        setSubmitting(false);
      }
    });
  };

  const submitWallet = async (method: "apple_pay" | "google_pay", walletResult: ApplePayResult | GooglePayResult) => {
    try {
      await submitPayment({
        amountCents: requestedAmountCents,
        paymentMethod: method,
        walletToken: walletResult.walletToken,
        walletBillingContact: walletResult.billingContact,
        clientAttemptId: attemptId,
        payer: {
          name: payerName.trim() || walletResult.billingContact.name,
          email: payerEmail.trim() || walletResult.billingContact.email,
          phone: payerPhone.trim() || undefined,
        },
      });
      setState({ step: "paid", data });
      return { success: true };
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Payment failed.");
      return { success: false };
    } finally {
      setWalletProcessing(null);
    }
  };

  handleApplePayClickRef.current = () => {
    const amountError = validateAmount();
    if (amountError) {
      toast.error(amountError);
      return;
    }
    if (!data.finixMerchantId || walletProcessing) return;
    setWalletProcessing("apple_pay");
    beginApplePaySession({
      amountCents: requestedAmountCents,
      totalLabel: data.churchName,
      onValidateMerchant: async (validationURL) => {
        const res = await fetch("/api/wallet/apple-pay/validate-merchant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ validationURL }),
        });
        if (!res.ok) throw new Error("Merchant validation failed");
        const json = await res.json();
        return json.merchantSession;
      },
      onAuthorized: (result) => submitWallet("apple_pay", result),
      onCancel: () => setWalletProcessing(null),
    });
  };

  handleGooglePayClickRef.current = async () => {
    const amountError = validateAmount();
    if (amountError) {
      toast.error(amountError);
      return;
    }
    if (!data.googlePayGatewayMerchantId || walletProcessing) return;
    setWalletProcessing("google_pay");
    try {
      const result = await requestGooglePayment(
        {
          environment: data.googlePayEnvironment,
          gatewayMerchantId: data.googlePayGatewayMerchantId,
          merchantId: data.googlePayMerchantId || undefined,
          merchantName: data.churchName,
        },
        requestedAmountCents
      );
      await submitWallet("google_pay", result);
    } catch {
      setWalletProcessing(null);
    }
  };

  const canPay = data.status !== "VOID" && data.status !== "DRAFT" && data.status !== "SCHEDULED" && data.status !== "UNCOLLECTIBLE" && data.balanceCents > 0;

  return (
    <div className="min-h-screen py-10 px-4 bg-slate-50">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          <div className="flex items-start justify-between mb-6">
            <div>
              {data.branding.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.branding.logoUrl} alt={data.branding.organizationDisplayName} className="h-10 mb-3 object-contain" />
              ) : (
                <h2 className="text-lg font-bold text-slate-900 mb-3">{data.branding.organizationDisplayName}</h2>
              )}
              <p className="text-sm text-slate-500">Invoice #{data.invoiceNumber}</p>
              {data.title && <p className="text-sm text-slate-500">{data.title}</p>}
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{ backgroundColor: `${accent}1a`, color: accent }}>
                {STATUS_LABELS[data.status] || data.status}
              </span>
              <a href={`/api/invoice/${token}/pdf`} target="_blank" rel="noreferrer" className="text-xs text-slate-400 hover:text-slate-600 underline">
                Download PDF
              </a>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm mb-6">
            <div>
              <p className="text-slate-400">Billed To</p>
              <p className="text-slate-900 font-medium">{data.clientName}</p>
            </div>
            <div className="text-right">
              <p className="text-slate-400">Due Date</p>
              <p className="text-slate-900 font-medium">{new Date(data.dueDate).toLocaleDateString("en-US")}</p>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-3 mb-4">
            {data.lineItems.map((li, i) => (
              <div key={i} className="flex justify-between text-sm">
                <div>
                  <p className="text-slate-900">{li.description}</p>
                  {li.detailedDescription && <p className="text-slate-400 text-xs">{li.detailedDescription}</p>}
                  <p className="text-slate-400 text-xs">
                    {li.quantity} × {formatCents(li.unitPriceCents)}
                  </p>
                </div>
                <p className="text-slate-900 font-medium">{formatCents(li.totalCents)}</p>
              </div>
            ))}
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-1 text-sm">
            <div className="flex justify-between text-slate-500">
              <span>Subtotal</span>
              <span>{formatCents(data.subtotalCents)}</span>
            </div>
            {data.discountCents > 0 && (
              <div className="flex justify-between text-slate-500">
                <span>Discount</span>
                <span>-{formatCents(data.discountCents)}</span>
              </div>
            )}
            {data.taxCents > 0 && (
              <div className="flex justify-between text-slate-500">
                <span>Tax</span>
                <span>{formatCents(data.taxCents)}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-900 font-bold text-base pt-2">
              <span>Total</span>
              <span>{formatCents(data.totalCents)}</span>
            </div>
            {data.amountPaidCents > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span>Paid</span>
                <span>-{formatCents(data.amountPaidCents)}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-900 font-bold text-base">
              <span>Balance Due</span>
              <span>{formatCents(data.balanceCents)}</span>
            </div>
          </div>

          {data.clientMemo && <p className="mt-4 text-sm text-slate-500 whitespace-pre-wrap">{data.clientMemo}</p>}
          {data.paymentInstructions && <p className="mt-2 text-sm text-slate-400 whitespace-pre-wrap">{data.paymentInstructions}</p>}
        </div>

        {canPay && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h3 className="text-base font-bold text-slate-900 mb-4">Make a Payment</h3>

            {data.allowPartialPayments && (
              <div className="mb-4">
                <label className="text-xs text-slate-500 mb-1 block">Amount to pay</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder={(data.balanceCents / 100).toFixed(2)}
                  value={payAmountInput}
                  onChange={(e) => setPayAmountInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 mb-4">
              <input placeholder="Full Name" value={payerName} onChange={(e) => setPayerName(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none" />
              <input placeholder="Email" value={payerEmail} onChange={(e) => setPayerEmail(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none" />
            </div>
            <input placeholder="Phone (Optional)" value={payerPhone} onChange={(e) => setPayerPhone(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none mb-4" />

            {(appleAvailable || googleAvailable) && (
              <div className="flex gap-3 mb-4">
                {appleAvailable && <div ref={applePayButtonRef} className="flex-1 h-11 [&_apple-pay-button]:w-full [&_apple-pay-button]:h-11" dangerouslySetInnerHTML={{ __html: `<apple-pay-button buttonstyle="black" type="pay" locale="en-US"></apple-pay-button>` }} />}
                {googleAvailable && <div ref={googlePayButtonRef} className="flex-1 h-11" />}
              </div>
            )}

            {(data.allowCard || data.allowAch) && (
              <>
                {data.allowCard && data.allowAch && (
                  <div className="flex gap-2 mb-3">
                    <button onClick={() => setPayMethod("card")} className={`flex-1 py-2 rounded-lg text-sm font-medium ${payMethod === "card" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}>
                      Card
                    </button>
                    <button onClick={() => setPayMethod("bank")} className={`flex-1 py-2 rounded-lg text-sm font-medium ${payMethod === "bank" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}>
                      Bank Account
                    </button>
                  </div>
                )}
                <div id="invoice-finix-form" className="min-h-[100px] border border-slate-200 rounded-lg p-3 mb-4" />
                <button
                  onClick={handleCardBankSubmit}
                  disabled={submitting || walletProcessing !== null}
                  className="w-full px-4 py-3 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
                  style={{ backgroundColor: accent }}
                >
                  {submitting ? "Processing…" : `Pay ${formatCents(requestedAmountCents || data.balanceCents)}`}
                </button>
              </>
            )}

            <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-400">
              <ShieldCheck className="w-3.5 h-3.5" /> Payments are securely processed. Your card and bank details are never stored by {data.branding.organizationDisplayName}.
            </p>
          </div>
        )}

        {!canPay && data.status !== "PAID" && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center text-sm text-slate-500 flex items-center justify-center gap-2">
            <Clock className="w-4 h-4" /> This invoice is not currently accepting payment.
          </div>
        )}

        {data.paymentHistory.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-3">Payment History</h3>
            <div className="space-y-2">
              {data.paymentHistory.map((p, i) => (
                <div key={i} className="flex justify-between text-sm text-slate-500">
                  <span>{new Date(p.date).toLocaleDateString("en-US")} — {p.method}</span>
                  <span>{formatCents(p.grossAmountCents - p.refundedCents)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {data.branding.footerMessage && <p className="text-center text-xs text-slate-400">{data.branding.footerMessage}</p>}
      </div>
    </div>
  );
}
