import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import GatewayIcon from "@/components/ui/GatewayIcon";
import { SMS_2FA_CONSENT_TEXT } from "@/lib/auth/smsConsentText";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SMS Verification Consent | WGC Payments",
  description: "How and when WGC Payments merchant users opt in to SMS two-factor authentication.",
  alternates: { canonical: "/legal/sms-consent" },
};

export default function SmsConsentPage() {
  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <div className="max-w-4xl mx-auto px-4 py-20">
        <div className="mb-12">
          <Link href="/" className="inline-block mb-10 group">
            <div className="flex items-center gap-2">
              <GatewayIcon className="h-10 w-auto transition-transform group-hover:scale-105 duration-500" />
              <span className="font-black text-wgc-navy-900 uppercase tracking-tighter text-2xl">WGC Payments</span>
            </div>
          </Link>
          <h1 className="text-4xl font-bold text-wgc-navy-900 tracking-tight">WGC Payments SMS Verification Consent</h1>
        </div>

        <div className="bg-white rounded-[3rem] p-10 md:p-16 border shadow-[0_32px_64px_-16px_rgba(0,0,0,0.05)] relative overflow-hidden">
          <div className="relative z-10 space-y-12 text-slate-600 leading-relaxed">
            <section>
              <h2 className="text-2xl font-bold text-wgc-navy-900 mb-4 tracking-tight">What this page is for</h2>
              <p>
                WGC Payments merchant users may voluntarily enable SMS two-factor authentication from their authenticated account under
                <strong> Settings &gt; Security</strong>. Providing a business phone number during account registration does{" "}
                <strong>not</strong> enroll the user in SMS messaging. SMS enrollment occurs only after the user enters a mobile number,
                affirmatively selects the SMS consent checkbox, and enables SMS two-factor authentication.
              </p>
              <p>
                SMS is used exclusively for WGC Payments merchant/account authentication and security — one-time verification codes
                sent when a user enrolls in or logs in with two-factor authentication. These are not marketing, promotional, or
                donor-facing messages.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-wgc-navy-900 mb-4 tracking-tight">Key facts</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>SMS two-factor authentication is entirely optional and is never a condition of creating or using a WGC Payments account.</li>
                <li>The consent checkbox is unchecked by default — it is never pre-checked and is never inferred from an existing phone number on file.</li>
                <li>Messages sent are authentication and account-security messages only.</li>
                <li>Message frequency varies based on login and security activity.</li>
                <li>Message and data rates may apply.</li>
                <li>Reply <strong>STOP</strong> to opt out at any time.</li>
                <li>Reply <strong>HELP</strong> for help.</li>
                <li>
                  See our{" "}
                  <Link href="/legal/privacy" className="text-blue-600 hover:underline">
                    Privacy Policy
                  </Link>{" "}
                  and{" "}
                  <Link href="/legal/terms" className="text-blue-600 hover:underline">
                    Terms of Service
                  </Link>
                  .
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-wgc-navy-900 mb-4 tracking-tight">The exact consent language shown to users</h2>
              <div className="rounded-2xl bg-slate-50 border border-slate-100 p-6">
                <p className="text-sm text-slate-700 italic">&ldquo;{SMS_2FA_CONSENT_TEXT}&rdquo;</p>
              </div>
              <p className="text-sm text-slate-500 mt-3">
                This exact text is shown next to an unchecked checkbox at the moment of enrollment — see the screenshots below.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-wgc-navy-900 mb-4 tracking-tight">The actual enrollment screen</h2>
              <p className="mb-6">
                The two screenshots below are captured from the live WGC Payments merchant dashboard&rsquo;s Settings &gt; Security page
                (shown with placeholder demo account data, no real customer information). The first shows the SMS 2FA enrollment form as
                every user first sees it — phone number field, consent checkbox unchecked, and the Enable button disabled until the
                checkbox is checked. The second shows the same screen immediately after a user affirmatively checks the box, which is
                what enables the button.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Before consent — checkbox unchecked, button disabled</p>
                  <Image
                    src="/legal/sms-consent/mfa-enrollment-unchecked.png"
                    alt="WGC Payments Settings > Security page showing the SMS two-factor authentication enrollment form with the mobile phone number field, the SMS consent checkbox unchecked, the full consent disclosure text, links to the Privacy Policy and Terms of Service, and a disabled Enable SMS 2FA button"
                    width={896}
                    height={1248}
                    className="rounded-2xl border border-slate-200 w-full h-auto"
                  />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">After consent — checkbox checked, button enabled</p>
                  <Image
                    src="/legal/sms-consent/mfa-enrollment-checked.png"
                    alt="The same WGC Payments SMS two-factor authentication enrollment form after the user has affirmatively checked the SMS consent checkbox, which enables the Enable SMS 2FA button"
                    width={896}
                    height={1248}
                    className="rounded-2xl border border-slate-200 w-full h-auto"
                  />
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-wgc-navy-900 mb-4 tracking-tight">Contact</h2>
              <p>
                Questions about SMS authentication or this consent process can be sent to{" "}
                <a href="mailto:support@wgcpayments.com" className="text-blue-600 hover:underline">
                  support@wgcpayments.com
                </a>
                .
              </p>
            </section>
          </div>

          <div className="absolute -right-20 -bottom-20 opacity-[0.02] pointer-events-none select-none text-[12rem] font-black text-wgc-navy-900 leading-none">SMS</div>
        </div>

        <p className="text-slate-500 font-medium tracking-tight mt-8 opacity-80 text-center text-sm">Last updated September 2026.</p>

        <div className="mt-12 text-center">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-wgc-navy-900 transition-colors uppercase tracking-widest font-mono">
            <ArrowLeft className="w-4 h-4" /> Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
