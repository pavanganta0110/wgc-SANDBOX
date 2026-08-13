"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, ShoppingBag, Trash2 } from "lucide-react";
import { mountFinixPaymentForm } from "@/lib/finix/tokenize";
import { getFraudSessionId } from "@/lib/finix/fraudSession";
import type { FinixPaymentFormInstance } from "@/lib/finix/fraudSession";

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
 */

const APPLICATION_ID = process.env.NEXT_PUBLIC_FINIX_APPLICATION_ID || "";
const FINIX_ENV = (process.env.NEXT_PUBLIC_FINIX_ENV as "sandbox" | "live") || "sandbox";

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
}: {
  slug: string;
  finixMerchantId: string;
  churchName: string;
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
  const [result, setResult] = useState<{ donationAmount: number; merchandiseAmount: number; shippingAmount: number; taxAmount: number; grandTotal: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formReady, setFormReady] = useState(false);
  const [finixForm, setFinixForm] = useState<FinixPaymentFormInstance | null>(null);

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

  const submit = async () => {
    setError(null);
    if (donationCents === 0 && cart.length === 0) return setError("Please enter a donation amount or add an item to your order.");
    if (!donor.name || !donor.email) return setError("Please enter your name and email.");
    if (cart.length > 0 && (!address.addressLine1 || !address.city || !address.state || !address.postalCode)) return setError("Please enter a complete shipping address.");
    if (cart.length > 0 && !shippingOptionId) return setError("Please select a shipping option.");
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
          token,
          fraudSessionId,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Checkout failed.");
      setResult(data);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
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

        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 mt-3">Payment</h4>
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

        <button onClick={submit} disabled={submitting} className="w-full px-6 py-3 rounded-xl font-bold text-slate-900 metallic-gold shadow-lg disabled:opacity-50 flex items-center justify-center gap-2">
          {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : `Give to ${churchName}`}
        </button>
      </div>
    </div>
  );
}
