"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { MessageSquare, Check, ShieldCheck, Clock } from "lucide-react";
import StateBadge from "@/components/merchant/StateBadge";
import { cn } from "@/lib/utils";

interface SmsAddonPlan {
  code: string;
  name: string;
  monthlyAmountCents: number;
  includedTexts: number;
  overageRateCents: number;
}

interface SmsAddonStatus {
  active: boolean;
  subscription: { planCode: string; status: string; includedTexts: number; monthlyAmountCents: number; overageRateCents: number } | null;
  usage: { textsSent: number; billingPeriod: string };
  plans: SmsAddonPlan[];
  canManageSubscription: boolean;
  smsConfigured: boolean;
}

function cents(n: number) {
  return `$${(n / 100).toFixed(2)}`;
}

function planShortName(name: string) {
  return name.replace(/^Text Messaging\s*—\s*/, "");
}

export default function SmsAddonCard() {
  const [status, setStatus] = useState<SmsAddonStatus | null>(null);
  const [subscribing, setSubscribing] = useState<string | null>(null);

  const load = () => {
    fetch("/api/merchant/sms-addon")
      .then((res) => res.json())
      .then(setStatus)
      .catch(() => {});
  };
  useEffect(load, []);

  const subscribe = async (planCode: string) => {
    setSubscribing(planCode);
    try {
      const res = await fetch("/api/merchant/sms-addon/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to subscribe");
      toast.success("Text messaging is active — you can send texts right away.");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to subscribe");
    } finally {
      setSubscribing(null);
    }
  };

  if (!status) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6">
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-wgc-gold-500/10 border border-wgc-gold-500/20 flex items-center justify-center shrink-0">
            <MessageSquare className="w-4 h-4 text-wgc-gold-600" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Text Messaging Add-on</h3>
            <p className="text-xs text-slate-400 mt-0.5">Send Giving Campaigns and giving-link shares by text.</p>
          </div>
        </div>
        {status.subscription && <StateBadge state={status.subscription.status} />}
      </div>

      {status.active && status.subscription ? (
        <>
          <div className="flex items-end justify-between mb-2">
            <div>
              <p className="text-2xl font-bold text-wgc-navy-950 tracking-tight">
                {cents(status.subscription.monthlyAmountCents)}
                <span className="text-sm font-semibold text-slate-400">/mo</span>
              </p>
              <p className="text-xs text-slate-500 mt-0.5">{status.subscription.includedTexts} texts included, then {cents(status.subscription.overageRateCents)}/text</p>
            </div>
            <p className="text-sm font-bold text-slate-800 text-right">
              {status.usage.textsSent}
              <span className="font-medium text-slate-400"> / {status.subscription.includedTexts} texts</span>
            </p>
          </div>

          <div className="h-2 rounded-full bg-slate-100 overflow-hidden mb-4">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                status.usage.textsSent > status.subscription.includedTexts ? "bg-amber-500" : "bg-wgc-navy-900"
              )}
              style={{ width: `${Math.min(100, (status.usage.textsSent / Math.max(1, status.subscription.includedTexts)) * 100)}%` }}
            />
          </div>

          <div className="flex items-start gap-2 rounded-xl bg-slate-50 border border-slate-100 px-3.5 py-3">
            <ShieldCheck className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
            <p className="text-xs text-slate-500 leading-relaxed">
              Nothing is blocked mid-campaign if you go over — overage is reviewed and billed to your card on file after the month closes.
            </p>
          </div>
        </>
      ) : !status.smsConfigured ? (
        <div className="flex items-start gap-3 rounded-xl bg-slate-50 border border-slate-100 px-4 py-4">
          <Clock className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-bold text-slate-700">Coming Soon</p>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Text messaging isn&rsquo;t available to subscribe to yet. We&rsquo;ll turn this on as soon as it&rsquo;s ready — nothing to do on
              your end in the meantime.
            </p>
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-500 mb-5">
            Activates immediately, no separate payment setup — bills to the card or bank already on file for your WGC platform subscription.
          </p>
          {status.canManageSubscription ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {status.plans.map((plan) => (
                <div
                  key={plan.code}
                  className="border border-slate-200 rounded-2xl p-5 hover:border-wgc-navy-200 hover:shadow-md transition-all"
                >
                  <p className="text-[10px] font-bold text-wgc-gold-600 uppercase tracking-widest mb-2">{planShortName(plan.name)}</p>
                  <p className="text-3xl font-bold text-wgc-navy-950 tracking-tight mb-1">
                    {cents(plan.monthlyAmountCents).replace(".00", "")}
                    <span className="text-sm font-semibold text-slate-400">/mo</span>
                  </p>

                  <ul className="space-y-1.5 my-4">
                    <li className="flex items-center gap-2 text-xs text-slate-600">
                      <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      {plan.includedTexts} texts included every month
                    </li>
                    <li className="flex items-center gap-2 text-xs text-slate-600">
                      <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      {cents(plan.overageRateCents)}/text after that
                    </li>
                    <li className="flex items-center gap-2 text-xs text-slate-600">
                      <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      No card required to activate
                    </li>
                  </ul>

                  <button
                    onClick={() => subscribe(plan.code)}
                    disabled={subscribing !== null}
                    className="w-full px-3 py-2.5 rounded-xl bg-wgc-navy-950 text-white text-xs font-bold hover:bg-wgc-navy-900 transition-colors disabled:opacity-50"
                  >
                    {subscribing === plan.code ? "Activating…" : "Subscribe"}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400">Only your organization owner can subscribe to add-ons.</p>
          )}
        </>
      )}
    </div>
  );
}
