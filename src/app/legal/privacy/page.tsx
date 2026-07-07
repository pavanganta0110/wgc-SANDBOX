import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <div className="max-w-4xl mx-auto px-4 py-20">
        
        {/* Header */}
        <div className="mb-12">
           <Link href="/" className="inline-block mb-10 group">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-wgc-gold-500 flex items-center justify-center shadow-lg shadow-wgc-gold-500/20 transform rotate-12 group-hover:rotate-0 transition-transform">
                  <span className="text-wgc-navy-900 font-black text-xl -rotate-12 group-hover:rotate-0 transition-transform">W</span>
                </div>
                <span className="font-black text-wgc-navy-900 uppercase tracking-tighter text-2xl">WGC Payments</span>
              </div>
           </Link>
           <h1 className="text-4xl font-bold text-wgc-navy-900 tracking-tight">Privacy Policy</h1>
           <p className="text-slate-500 font-medium tracking-tight mt-2 opacity-80">Last updated July 2026.</p>
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
                <li>Church or Organization name</li>
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
              <h2 className="text-2xl font-bold text-wgc-navy-900 mb-4 tracking-tight">6. Contact Us</h2>
              <p>
                If you have questions about this Privacy Policy or how your data is handled, please contact us at:
              </p>
              <p className="mt-4 font-bold text-wgc-navy-900">
                privacy@wgcpayments.com
              </p>
            </section>

          </div>

          {/* Background branding */}
          <div className="absolute -right-20 -bottom-20 opacity-[0.02] pointer-events-none select-none text-[12rem] font-black text-wgc-navy-900 leading-none">PRIVACY</div>
        </div>
        
        <div className="mt-12 text-center">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-wgc-navy-900 transition-colors uppercase tracking-widest font-mono">
            <ArrowLeft className="w-4 h-4" /> Back to Home
          </Link>
        </div>
        
      </div>
    </div>
  );
}
