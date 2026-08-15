"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, ShoppingBag, Trash2 } from "lucide-react";
import { mountFinixPaymentForm } from "@/lib/finix/tokenize";
import { getFraudSessionId } from "@/lib/finix/fraudSession";
import type { FinixPaymentFormInstance } from "@/lib/finix/fraudSession";
import { isApplePayAvailable, loadApplePayButtonScript, beginApplePaySession, type ApplePayResult } from "@/lib/finix/wallets/applePay";
import { isGooglePayAvailable, createGooglePayButton, requestGooglePayment, type GooglePayResult } from "@/lib/finix/wallets/googlePay";

/**
 * Rendered ONLY when GivingLink.merchandiseEnabled is true (see
 * src/app/g/[slug]/page.tsx's branch) — a giving page that never enables
 * merchandise keeps using the existing GivingLinkForm completely
 * unmodified. This is a deliberately separate, self-contained donation +
 * cart + checkout experience (rather than bolting a cart onto the
 * 1,400-line existing form) so the existing critical donation path carries
 * zero risk from this feature. Submits once to /api/merchandise/checkout,
 * which is the only place donation + merchandise + shipping combine into
 * one Finix charge (spec item 34/73 — Finix remains the sole processor,
 * exactly one charge, Printful never sees payment data).
 *
 * Apple Pay / Google Pay reuse the exact same wallet libraries
 * (src/lib/finix/wallets/*) and server-side wallet-instrument shape the
 * existing donate route already uses — see checkoutService.ts's isWallet
 * branch. No previewMode concept here (unlike GivingLinkForm) — this
 * component only ever renders on the real, live donor-facing page.
 */

const APPLICATION_ID = process.env.NEXT_PUBLIC_FINIX_APPLICATION_ID || "";
const FINIX_ENV = (process.env.NEXT_PUBLIC_FINIX_ENV as "sandbox" | "live") || "sandbox";
const APPLE_PAY_ENABLED = Boolean(process.env.NEXT_PUBLIC_FINIX_APPLE_PAY_MERCHANT_IDENTIFIER || process.env.NEXT_PUBLIC_APPLE_PAY_MERCHANT_ID);

interface ProductVariant {
  id: string;
  externalVariantId: string;
  name: string;
  size: string | null;
  color: string | null;
  imageUrl: string | null;
  price: number;
  available: boolean;
}
interface Product {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  featured: boolean;
  variants: ProductVariant[];
}
interface CartLine {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  imageUrl: string | null;
  price: number;
  quantity: number;
}

const SUGGESTED_AMOUNTS = [2500, 5000, 10000, 25000];

export default function MerchandiseGivingExperience({
  slug,
  finixMerchantId,
  churchName,
  allowedPaymentMethods = ["CARD", "APPLE_PAY", "GOOGLE_PAY"],
  googlePayGatewayMerchantId = null,
  googlePayMerchantId = null,
  googlePayEnvironment = "TEST",
  serverAvailability,
}: {
  slug: string;
  finixMerchantId: string;
  churchName: string;
  allowedPaymentMethods?: string[];
  googlePayGatewayMerchantId?: string | null;
  googlePayMerchantId?: string | null;
  googlePayEnvironment?: "TEST" | "PRODUCTION";
  serverAvailability?: { APPLE_PAY?: { enabledForOrganization: boolean }; GOOGLE_PAY?: { enabledForOrganization: boolean } };
}) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [donationAmount, setDonationAmount] = useState<number | null>(SUGGESTED_AMOUNTS[1]);
  const [customAmount, setCustomAmount] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [pickers, setPickers] = useState<Record<string, string>>({}); // productId -> selected variantId

  const [donor, setDonor] = useState({ name: "", email: "", phone: "" });
  const [address, setAddress] = useState({ addressLine1: "", addressLine2: "", city: "", state: "", postalCode: "", country: "USA" });
  const [shippingOptions, setShippingOptions] = useState<{ id: string; name: string; rate: number; minDays: number | null; maxDays: number | null }[]>([]);
  const [shippingOptionId, setShippingOptionId] = useState<string | null>(null);
  const [shippingLoading, setShippingLoading] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [walletProcessing, setWalletProcessing] = useState<"apple_pay" | "google_pay" | null>(null);
  const [result, setResult] = useState<{ donationAmount: number; merchandiseAmount: number; shippingAmount: number; taxAmount: number; grandTotal: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formReady, setFormReady] = useState(false);
  const [finixForm, setFinixForm] = useState<FinixPaymentFormInstance | null>(null);

  const [appleAvailable, setAppleAvailable] = useState(false);
  const [googleAvailable, setGoogleAvailable] = useState(false);
  const applePayButtonRef = useRef<HTMLElement>(null);
  const googlePayButtonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/g/${slug}/merchandise`)
      .then((res) => res.json())
      .then((data) => setProducts(data.products || []))
      .catch(() => setProducts([]));
  }, [slug]);

  useEffect(() => {
    // Mounted exactly once — Finix.PaymentForm appends into its container
    // rather than replacing content, so remounting on every submit
    // (as an earlier version of this component did) would stack duplicate
    // card forms, the same bug already fixed once in ActivationForm.tsx.
    mountFinixPaymentForm("merch-giving-finix-form", APPLICATION_ID, { paymentMethods: ["card"], showAddress: false }, FINIX_ENV)
      .then((form) => {
        setFinixForm(form);
        setFormReady(true);
      })
      .catch((err) => console.error("Failed to mount Finix payment form:", err));
  }, []);

  const donationCents = customAmount ? Math.round(Number(customAmount) * 100) || 0 : donationAmount || 0;

  const cartSubtotal = useMemo(() => cart.reduce((sum, i) => sum + i.price * i.quantity, 0), [cart]);
  const shippingRate = useMemo(() => shippingOptions.find((o) => o.id === shippingOptionId)?.rate ?? 0, [shippingOptions, shippingOptionId]);
  const grandTotal = donationCents + cartSubtotal + (cart.length > 0 ? shippingRate : 0);

  const donorInfoValid = Boolean(donor.name.trim() && donor.email.trim());

  // --- Apple Pay availability + button script ---
  useEffect(() => {
    setAppleAvailable(false);
    if (!allowedPaymentMethods.includes("APPLE_PAY")) return;
    if (!APPLE_PAY_ENABLED) return;
    if (serverAvailability?.APPLE_PAY && !serverAvailability.APPLE_PAY.enabledForOrganization) return;
    if (!isApplePayAvailable()) return;
    setAppleAvailable(true);
    loadApplePayButtonScript().catch((err) => console.error("Apple Pay button SDK failed to load:", err));
  }, [allowedPaymentMethods, serverAvailability]);

  // --- Google Pay availability ---
  useEffect(() => {
    setGoogleAvailable(false);
    if (!allowedPaymentMethods.includes("GOOGLE_PAY")) return;
    if (!googlePayGatewayMerchantId) return;
    if (serverAvailability?.GOOGLE_PAY && !serverAvailability.GOOGLE_PAY.enabledForOrganization) return;
    let cancelled = false;
    isGooglePayAvailable({ environment: googlePayEnvironment, gatewayMerchantId: googlePayGatewayMerchantId, merchantId: googlePayMerchantId || undefined, merchantName: churchName })
      .then((available) => {
        if (!cancelled && available) setGoogleAvailable(true);
      })
      .catch((err) => console.error("Google Pay isReadyToPay threw:", err));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googlePayGatewayMerchantId, googlePayEnvironment, googlePayMerchantId, allowedPaymentMethods]);

  // --- Google Pay button creation (separate effect — the container <div> only exists once googleAvailable flips true) ---
  useEffect(() => {
    if (!googleAvailable || !googlePayGatewayMerchantId) return;
    let cancelled = false;
    const config = { environment: googlePayEnvironment, gatewayMerchantId: googlePayGatewayMerchantId, merchantId: googlePayMerchantId || undefined, merchantName: churchName };
    createGooglePayButton(config, () => handleGooglePayClickRef.current(), "checkout")
      .then((button) => {
        if (cancelled || !googlePayButtonRef.current) return;
        googlePayButtonRef.current.innerHTML = "";
        googlePayButtonRef.current.appendChild(button);
      })
      .catch((err) => console.error("Google Pay createGooglePayButton threw:", err));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleAvailable, googlePayGatewayMerchantId, googlePayEnvironment, googlePayMerchantId]);

  const addToCart = (product: Product) => {
    const variantId = pickers[product.id] || product.variants[0]?.id;
    const variant = product.variants.find((v) => v.id === variantId);
    if (!variant || !variant.available) return;
    setCart((prev) => {
      const existing = prev.find((l) => l.variantId === variant.id);
      if (existing) return prev.map((l) => (l.variantId === variant.id ? { ...l, quantity: Math.min(l.quantity + 1, 25) } : l));
      return [...prev, { variantId: variant.id, productId: product.id, productName: product.title, variantName: variant.name, imageUrl: variant.imageUrl || product.imageUrl, price: variant.price, quantity: 1 }];
    });
  };

  const updateQty = (variantId: string, quantity: number) => {
    if (quantity <= 0) return setCart((prev) => prev.filter((l) => l.variantId !== variantId));
    setCart((prev) => prev.map((l) => (l.variantId === variantId ? { ...l, quantity: Math.min(quantity, 25) } : l)));
  };

  const fetchShippingRates = async () => {
    if (cart.length === 0 || !address.postalCode || !address.city || !address.state) return;
    setShippingLoading(true);
    try {
      const res = await fetch("/api/merchandise/shipping-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, address, items: cart.map((l) => ({ variantId: l.variantId, quantity: l.quantity })) }),
      });
      const data = await res.json();
      if (res.ok) {
        setShippingOptions(data.options || []);
        if (data.options?.length && !shippingOptionId) setShippingOptionId(data.options[0].id);
      }
    } finally {
      setShippingLoading(false);
    }
  };

  /** Shared pre-payment validation for all three payment paths (card, Apple
   * Pay, Google Pay) — returns an error string, or null if everything's OK. */
  const validateBeforePay = (): string | null => {
    if (donationCents === 0 && cart.length === 0) return "Please enter a donation amount or add an item to your order.";
    if (!donorInfoValid) return "Please enter your name and email.";
    if (cart.length > 0 && (!address.addressLine1 || !address.city || !address.state || !address.postalCode)) return "Please enter a complete shipping address.";
    if (cart.length > 0 && !shippingOptionId) return "Please select a shipping option.";
    return null;
  };

  /** Shared checkout submission — used by the card path (with `token`) and
   * both wallet paths (with `paymentMethod`/`walletToken`/`walletBillingContact`). */
  const submitCheckout = async (payload: Record<string, unknown>): Promise<boolean> => {
    try {
      const res = await fetch("/api/merchandise/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          clientAttemptId: crypto.randomUUID(),
          donationAmountCents: donationCents,
          cartItems: cart.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
          shippingOptionId,
          address: cart.length > 0 ? address : null,
          donor,
          ...payload,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Checkout failed.");
      setResult(data);
      return true;
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
      return false;
    }
  };

  const submit = async () => {
    setError(null);
    const validationError = validateBeforePay();
    if (validationError) return setError(validationError);
    if (!formReady || !finixForm) return setError("Payment form is still loading — please wait a moment.");

    setSubmitting(true);
    try {
      const fraudSessionId = await getFraudSessionId(finixMerchantId, FINIX_ENV);
      const token = await new Promise<string>((resolve, reject) => {
        finixForm.submit((err, response) => {
          if (err || !response?.data?.id) return reject(new Error("Could not process card details."));
          resolve(response.data.id);
        });
      });
      await submitCheckout({ token, fraudSessionId });
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const submitWalletPayment = async (method: "apple_pay" | "google_pay", walletResult: ApplePayResult | GooglePayResult) => {
    try {
      const fraudSessionId = await Promise.race([
        getFraudSessionId(finixMerchantId, FINIX_ENV),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Fraud session request timed out after 10s")), 10000)),
      ]);
      return await submitCheckout({
        paymentMethod: method,
        walletToken: walletResult.walletToken,
        walletBillingContact: walletResult.billingContact,
        fraudSessionId,
      });
    } catch (err: any) {
      setError(err.message || "Something went wrong submitting your order. Please try again.");
      return false;
    } finally {
      setWalletProcessing(null);
    }
  };

  // Bound via a ref (see the native-listener effect below for Apple Pay) so
  // the click handler always sees current cart/donation/address state
  // without needing to re-bind the native event listener on every render.
  const handleApplePayClickRef = useRef<() => void>(() => {});
  handleApplePayClickRef.current = () => {
    const validationError = validateBeforePay();
    if (validationError) return setError(validationError);
    if (walletProcessing !== null) return;
    setError(null);
    setWalletProcessing("apple_pay");
    beginApplePaySession({
      amountCents: grandTotal,
      totalLabel: churchName,
      onValidateMerchant: async (validationURL) => {
        const res = await fetch("/api/wallet/apple-pay/validate-merchant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ validationURL }),
        });
        if (!res.ok) throw new Error("Merchant validation failed");
        const data = await res.json();
        return data.merchantSession;
      },
      onAuthorized: async (walletResult) => {
        const success = await submitWalletPayment("apple_pay", walletResult);
        return { success: success !== false };
      },
      onCancel: () => setWalletProcessing(null),
    });
  };

  // Apple's official <apple-pay-button> custom element doesn't reliably
  // deliver clicks through React's synthetic event system in Safari (same
  // issue documented in GivingLinkForm.tsx) — bound with a real
  // addEventListener directly on the element instead.
  useEffect(() => {
    if (!appleAvailable) return;
    const el = applePayButtonRef.current;
    if (!el) return;
    const onClick = () => handleApplePayClickRef.current();
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, [appleAvailable]);

  const handleGooglePayClickRef = useRef<() => void>(() => {});
  handleGooglePayClickRef.current = async () => {
    const validationError = validateBeforePay();
    if (validationError) return setError(validationError);
    if (!googlePayGatewayMerchantId || walletProcessing !== null) return;
    setError(null);
    setWalletProcessing("google_pay");
    try {
      const walletResult = await requestGooglePayment({ environment: googlePayEnvironment, gatewayMerchantId: googlePayGatewayMerchantId, merchantId: googlePayMerchantId || undefined, merchantName: churchName }, grandTotal);
      await submitWalletPayment("google_pay", walletResult);
    } catch (err: any) {
      // User closing the Google Pay sheet rejects with CANCELED — not a
      // real error, just clear the processing state silently.
      if (err?.statusCode !== "CANCELED") setError(err?.message || "Something went wrong with Google Pay.");
      setWalletProcessing(null);
    }
  };

  if (result) {
    return (
      <div className="text-center py-6">
        <h2 className="text-lg font-bold text-slate-900 mb-4">Thank you!</h2>
        <div className="text-left bg-slate-50 rounded-xl p-4 space-y-1.5 text-sm">
          {result.donationAmount > 0 && (
            <div className="flex justify-between">
              <span className="text-slate-600">Donation</span>
              <span className="font-semibold">${(result.donationAmount / 100).toFixed(2)}</span>
            </div>
          )}
          {result.merchandiseAmount > 0 && (
            <div className="flex justify-between">
              <span className="text-slate-600">Merchandise</span>
              <span className="font-semibold">${(result.merchandiseAmount / 100).toFixed(2)}</span>
            </div>
          )}
          {result.shippingAmount > 0 && (
            <div className="flex justify-between">
              <span className="text-slate-600">Shipping</span>
              <span className="font-semibold">${(result.shippingAmount / 100).toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between pt-1.5 border-t border-slate-200 font-bold text-slate-900">
            <span>Total charged</span>
            <span>${(result.grandTotal / 100).toFixed(2)}</span>
          </div>
        </div>
        {result.merchandiseAmount > 0 && <p className="text-xs text-slate-400 mt-4">Only the donation portion above is a charitable contribution.</p>}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-bold text-slate-900 mb-3">Make a Gift</h3>
        <div className="grid grid-cols-2 gap-2 mb-2">
          {SUGGESTED_AMOUNTS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => { setDonationAmount(a); setCustomAmount(""); }}
              className={`py-2.5 rounded-xl text-sm font-bold border ${donationAmount === a && !customAmount ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-700"}`}
            >
              ${(a / 100).toFixed(0)}
            </button>
          ))}
        </div>
        <input
          type="number"
          placeholder="Other amount"
          value={customAmount}
          onChange={(e) => { setCustomAmount(e.target.value); setDonationAmount(null); }}
          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none"
        />
      </div>

      {products && products.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
            <ShoppingBag className="w-4 h-4" /> Support Us With Merchandise
          </h3>
          <div className="space-y-4">
            {products.map((p) => (
              <div key={p.id} className="border border-slate-200 rounded-xl p-4">
                <div className="flex gap-3">
                  {p.imageUrl && <img src={p.imageUrl} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />}
                  <div className="flex-grow min-w-0">
                    <p className="font-semibold text-slate-900 text-sm">{p.title}</p>
                    <p className="text-xs text-slate-500 mb-2">{p.description}</p>
                    <select
                      value={pickers[p.id] || p.variants[0]?.id}
                      onChange={(e) => setPickers((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs outline-none mb-2"
                    >
                      {p.variants.map((v) => (
                        <option key={v.id} value={v.id} disabled={!v.available}>
                          {v.name} — ${(v.price / 100).toFixed(2)} {!v.available ? "(unavailable)" : ""}
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={() => addToCart(p)} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-900 text-white hover:bg-slate-800">
                      Add to Order
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {cart.length > 0 && (
        <div className="border-t border-slate-100 pt-4">
          <h3 className="text-sm font-bold text-slate-900 mb-3">Your Order</h3>
          <div className="space-y-2 mb-4">
            {cart.map((l) => (
              <div key={l.variantId} className="flex items-center gap-3 text-sm">
                {l.imageUrl && <img src={l.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />}
                <div className="flex-grow min-w-0">
                  <p className="font-semibold text-slate-900 truncate">{l.productName}</p>
                  <p className="text-xs text-slate-500">{l.variantName}</p>
                </div>
                <input type="number" min={1} max={25} value={l.quantity} onChange={(e) => updateQty(l.variantId, Number(e.target.value))} className="w-14 px-2 py-1 rounded-lg border border-slate-200 text-xs text-center" />
                <span className="font-semibold w-16 text-right">${((l.price * l.quantity) / 100).toFixed(2)}</span>
                <button type="button" onClick={() => updateQty(l.variantId, 0)} className="text-red-500 shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Shipping Address</h4>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <input placeholder="Address Line 1" value={address.addressLine1} onChange={(e) => setAddress((a) => ({ ...a, addressLine1: e.target.value }))} className="col-span-2 px-3 py-2 rounded-lg border border-slate-200 text-sm" />
            <input placeholder="City" value={address.city} onChange={(e) => setAddress((a) => ({ ...a, city: e.target.value }))} onBlur={fetchShippingRates} className="px-3 py-2 rounded-lg border border-slate-200 text-sm" />
            <input placeholder="State" value={address.state} onChange={(e) => setAddress((a) => ({ ...a, state: e.target.value }))} onBlur={fetchShippingRates} className="px-3 py-2 rounded-lg border border-slate-200 text-sm" />
            <input placeholder="ZIP" value={address.postalCode} onChange={(e) => setAddress((a) => ({ ...a, postalCode: e.target.value }))} onBlur={fetchShippingRates} className="px-3 py-2 rounded-lg border border-slate-200 text-sm" />
            <input placeholder="Country" value={address.country} onChange={(e) => setAddress((a) => ({ ...a, country: e.target.value }))} className="px-3 py-2 rounded-lg border border-slate-200 text-sm" />
          </div>

          {shippingLoading && <p className="text-xs text-slate-400 mb-2">Calculating shipping…</p>}
          {shippingOptions.length > 0 && (
            <div className="space-y-1.5 mb-2">
              {shippingOptions.map((o) => (
                <label key={o.id} className="flex items-center justify-between text-sm border border-slate-200 rounded-lg px-3 py-2 cursor-pointer">
                  <span className="flex items-center gap-2">
                    <input type="radio" checked={shippingOptionId === o.id} onChange={() => setShippingOptionId(o.id)} />
                    {o.name} {o.minDays ? `(${o.minDays}–${o.maxDays} days)` : ""}
                  </span>
                  <span className="font-semibold">${(o.rate / 100).toFixed(2)}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="border-t border-slate-100 pt-4">
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Your Information</h4>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <input placeholder="Full name" value={donor.name} onChange={(e) => setDonor((d) => ({ ...d, name: e.target.value }))} className="col-span-2 px-3 py-2 rounded-lg border border-slate-200 text-sm" />
          <input placeholder="Email" type="email" value={donor.email} onChange={(e) => setDonor((d) => ({ ...d, email: e.target.value }))} className="px-3 py-2 rounded-lg border border-slate-200 text-sm" />
          <input placeholder="Phone (optional)" value={donor.phone} onChange={(e) => setDonor((d) => ({ ...d, phone: e.target.value }))} className="px-3 py-2 rounded-lg border border-slate-200 text-sm" />
        </div>

        {(appleAvailable || googleAvailable) && (
          <div className="mb-4">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Express Checkout</h4>
            {!donorInfoValid && <p className="text-xs text-slate-400 mb-2">Enter your name and email to continue.</p>}
            <div className="space-y-2">
              {appleAvailable && (
                <div className={walletProcessing !== null ? "opacity-50 pointer-events-none" : !donorInfoValid ? "opacity-50" : undefined}>
                  {/* Apple's official button web component — never hand-styled, per Apple's HIG.
                      Click is bound natively via applePayButtonRef in the effect above, not a
                      React onClick — see that effect's comment. */}
                  {/* @ts-expect-error -- custom element from Apple's Apple Pay button SDK */}
                  <apple-pay-button ref={applePayButtonRef} buttonstyle="black" type="buy" locale="en-US" style={{ width: "100%", height: "44px", display: "block" }} />
                  {walletProcessing === "apple_pay" && <p className="text-xs text-center mt-1 text-slate-500">Processing order…</p>}
                </div>
              )}
              {googleAvailable && (
                <div className={!donorInfoValid && walletProcessing === null ? "opacity-50" : undefined}>
                  <div ref={googlePayButtonRef} className={walletProcessing === "google_pay" ? "opacity-50 pointer-events-none" : ""} style={{ minHeight: 44 }} />
                  {walletProcessing === "google_pay" && <p className="text-xs text-center mt-1 text-slate-500">Processing order…</p>}
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 my-4">
              <div className="flex-grow h-px bg-slate-100" />
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Or pay with card</span>
              <div className="flex-grow h-px bg-slate-100" />
            </div>
          </div>
        )}

        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Payment</h4>
        <div id="merch-giving-finix-form" className="mb-4 min-h-[120px] border border-slate-200 rounded-xl p-3" />

        <div className="bg-slate-50 rounded-xl p-4 space-y-1 text-sm mb-4">
          {donationCents > 0 && (
            <div className="flex justify-between">
              <span className="text-slate-600">Donation</span>
              <span>${(donationCents / 100).toFixed(2)}</span>
            </div>
          )}
          {cart.length > 0 && (
            <>
              <div className="flex justify-between">
                <span className="text-slate-600">Merchandise</span>
                <span>${(cartSubtotal / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Shipping</span>
                <span>${(shippingRate / 100).toFixed(2)}</span>
              </div>
            </>
          )}
          <div className="flex justify-between pt-1 border-t border-slate-200 font-bold text-slate-900">
            <span>Total</span>
            <span>${(grandTotal / 100).toFixed(2)}</span>
          </div>
        </div>

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        <button onClick={submit} disabled={submitting || walletProcessing !== null} className="w-full px-6 py-3 rounded-xl font-bold text-slate-900 metallic-gold shadow-lg disabled:opacity-50 flex items-center justify-center gap-2">
          {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : `Give to ${churchName}`}
        </button>
      </div>
    </div>
  );
}
