import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import GatewayIcon from "@/components/ui/GatewayIcon";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | WGC Payments",
  description: "How Waypoint Gateway Collective collects, uses, and protects data across its payment infrastructure.",
  alternates: { canonical: "/legal/privacy" },
  openGraph: {
    images: [{ url: "/og/default.png", width: 1200, height: 630 }], title: "Privacy Policy | WGC Payments", description: "How Waypoint Gateway Collective collects, uses, and protects data across its payment infrastructure.", url: "https://www.wgcpayments.com/legal/privacy" },
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <div className="max-w-4xl mx-auto px-4 py-20">
        
        {/* Header */}
        <div className="mb-12">
           <Link href="/" className="inline-block mb-10 group">
              <div className="flex items-center gap-2">
                <GatewayIcon className="h-10 w-auto transition-transform group-hover:scale-105 duration-500" />
                <span className="font-black text-wgc-navy-900 uppercase tracking-tighter text-2xl">WGC Payments</span>
              </div>
           </Link>
           <h1 className="text-4xl font-bold text-wgc-navy-900 tracking-tight">Privacy Policy</h1>
        </div>

        {/* Content */}
        <div className="bg-white rounded-[3rem] p-10 md:p-16 border shadow-[0_32px_64px_-16px_rgba(0,0,0,0.05)] relative overflow-hidden">
          
          <div className="relative z-10 space-y-12 text-slate-600 leading-relaxed">
            
            <section>
              <h2 className="text-2xl font-bold text-wgc-navy-900 mb-4 tracking-tight">1. What WGC Collects</h2>
              <p>
                To provide our payment platform and onboarding services, WGC Payments may collect:
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-4">
                <li>Church, 501(c) organization, or organization name</li>
                <li>Admin name, email, and phone number</li>
                <li>Business details (address, EIN, tax status)</li>
                <li>Onboarding status and progress</li>
                <li>Donation records and transaction history</li>
                <li>Donor contact information (if provided by the donor during checkout)</li>
                <li>Payment metadata (amounts, dates, statuses, partial masked details)</li>
                <li>Payout metadata (settlement records, statuses)</li>
                <li>Support messages and inquiries</li>
                <li>Audit logs and access history</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-wgc-navy-900 mb-4 tracking-tight">2. What WGC Does NOT Store</h2>
              <p>
                WGC Payments utilizes secure Finix tokenization for sensitive financial data. Therefore, WGC Payments <strong>does not store</strong>:
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-4">
                <li>Full credit or debit card numbers (PAN)</li>
                <li>Card security codes (CVV/CVC)</li>
                <li>Full bank account numbers</li>
                <li>Full routing numbers</li>
                <li>Raw wallet tokens (e.g., raw Apple Pay or Google Pay payloads)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-wgc-navy-900 mb-4 tracking-tight">3. Sharing with Finix & Partners</h2>
              <p>
                WGC shares necessary data with Finix Payments, Inc., payment processors, sponsor banks, service providers, and compliance partners. This sharing is strictly limited to the purposes of:
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-4">
                <li>Merchant onboarding and KYC underwriting</li>
                <li>Payment processing and authorization</li>
                <li>Dispute and chargeback handling</li>
                <li>Payouts and settlements</li>
                <li>Fraud prevention and risk monitoring</li>
                <li>Reporting and legal compliance</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-wgc-navy-900 mb-4 tracking-tight">4. Security</h2>
              <p>
                WGC uses Finix Tokenization forms to ensure sensitive payment information bypasses our servers. We employ restricted access controls, comprehensive audit logging, and encrypted/secure infrastructure (such as TLS for data in transit) to protect the data we do handle.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-wgc-navy-900 mb-4 tracking-tight">5. Data Retention</h2>
              <p>
                WGC retains records as needed for legal, compliance, tax, dispute resolution, payment tracking, and business purposes. When data is no longer required for these purposes, it is securely deleted or anonymized in accordance with applicable laws.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-wgc-navy-900 mb-4 tracking-tight">6. Donor Giving-Link SMS Messaging</h2>
              <p>
                Organizations using WGC Payments may send text messages containing a giving/donation link to their own donors through our
                platform. By providing a mobile phone number to an organization, or by an organization providing a donor&rsquo;s mobile phone
                number to us on their behalf, the recipient consents to receive text messages related to that organization&rsquo;s giving
                communications.
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-4">
                <li>Message frequency varies by organization and campaign; you should not expect a fixed number of messages per month.</li>
                <li>Message and data rates may apply, depending on your mobile carrier and plan.</li>
                <li>
                  Mobile phone numbers collected for text messaging are <strong>not sold, rented, or shared with third parties</strong> for
                  marketing purposes. Numbers are used solely to deliver the sending organization&rsquo;s own giving communications and are
                  shared only with our SMS delivery provider as strictly necessary to send those messages.
                </li>
                <li>You may opt out of text messages at any time by replying STOP. Reply HELP for assistance.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-wgc-navy-900 mb-4 tracking-tight">7. SMS Account Verification and Two-Factor Authentication</h2>
              <p>
                Authorized WGC Payments account users may voluntarily provide a mobile telephone number to receive SMS authentication and
                security verification messages. This is separate and distinct from the donor giving-link messaging described above — these
                are one-time verification codes sent only to a WGC Payments merchant/account user who has enrolled their own account.
              </p>
              <p className="mt-4">
                Enrollment in SMS authentication is optional. Providing a telephone number elsewhere on the WGC Payments platform (for
                example, a business phone number entered during account registration) does <strong>not</strong> automatically enroll a
                user in SMS messaging. Enrollment happens only from the authenticated account&rsquo;s Settings &gt; Security page, where the
                user enters a mobile number and affirmatively checks a consent checkbox that is unchecked by default.
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-4">
                <li>Message frequency varies based on authentication and account-security activity.</li>
                <li>Message and data rates may apply.</li>
                <li>
                  Mobile numbers, SMS opt-in data, and consent records are <strong>not sold, rented, or shared with third parties or
                  affiliates for their marketing or promotional purposes</strong>. Information may be disclosed to service providers solely
                  as necessary to provide the requested messaging service, maintain security, prevent fraud, or comply with law — for
                  example, our SMS delivery provider (Twilio) necessarily receives the phone number in order to deliver the message.
                </li>
                <li>Users may reply STOP to opt out and HELP for assistance.</li>
              </ul>
              <p className="mt-4 text-sm text-slate-500">
                See{" "}
                <Link href="/legal/sms-consent" className="text-blue-600 hover:underline">
                  our SMS verification consent page
                </Link>{" "}
                for the exact consent language and screenshots of the enrollment flow.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-wgc-navy-900 mb-4 tracking-tight">8. Contact Us</h2>
              <p>
                If you have questions about this Privacy Policy or how your data is handled, please contact us at:
              </p>
              <p className="mt-4 font-bold text-wgc-navy-900">
                support@wgcpayments.com
              </p>
            </section>

          </div>

          {/* Background branding */}
          <div className="absolute -right-20 -bottom-20 opacity-[0.02] pointer-events-none select-none text-[12rem] font-black text-wgc-navy-900 leading-none">PRIVACY</div>
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
