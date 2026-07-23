import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import GatewayIcon from "@/components/ui/GatewayIcon";

export default function TermsPage() {
  const finixTermsUrl = process.env.NEXT_PUBLIC_FINIX_TERMS_URL || "https://finix-hosted-content.s3.amazonaws.com/flex/v3/finix-terms-of-service.html";
  const finixPrivacyUrl = process.env.NEXT_PUBLIC_FINIX_PRIVACY_URL || "https://finix.com/privacy";

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
           <h1 className="text-4xl font-bold text-wgc-navy-900 tracking-tight">Terms of Service</h1>
           <p className="text-xs text-slate-400 mt-4 max-w-2xl">
             These Terms are provided for platform onboarding and payment service use. Final terms may be subject to additional agreements between WGC Payments and the organization.
           </p>
        </div>

        {/* Content */}
        <div className="bg-white rounded-[3rem] p-10 md:p-16 border shadow-[0_32px_64px_-16px_rgba(0,0,0,0.05)] relative overflow-hidden">
          
          <div className="relative z-10 space-y-12 text-slate-600 leading-relaxed">
            
            <section>
              <h2 className="text-2xl font-bold text-wgc-navy-900 mb-4 tracking-tight">1. Introduction</h2>
              <p>
                WGC Payments is a platform that helps organizations accept donations and manage payment activity. WGC works with Finix Payments, Inc. ("Finix") and its processors/banks to provide payment processing services.
              </p>
            </section>
            
            <section>
              <h2 className="text-2xl font-bold text-wgc-navy-900 mb-4 tracking-tight">2. Authorized Representative</h2>
              <p>
                The person accepting these terms confirms they are authorized to act on behalf of the organization utilizing WGC Payments.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-wgc-navy-900 mb-4 tracking-tight">3. Acceptance of WGC and Finix Terms</h2>
              <p className="mb-4 font-semibold text-slate-800">By continuing, you agree to our Terms of Service and the Finix Terms of Service.</p>
              <p className="mb-4">Specifically, the organization agrees to the following agreements and policies:</p>
              <ul className="list-disc pl-6 space-y-2 mb-4">
                <li><Link href="/legal/terms" className="text-wgc-navy-600 font-medium hover:underline">WGC Payments Terms of Service</Link></li>
                <li><Link href="/legal/fees" className="text-wgc-navy-600 font-medium hover:underline">WGC Fee Schedule</Link></li>
                <li><Link href="/legal/privacy" className="text-wgc-navy-600 font-medium hover:underline">WGC Privacy Policy</Link></li>
                <li><a href={finixTermsUrl} target="_blank" rel="noopener noreferrer" className="text-wgc-navy-600 font-medium hover:underline">Finix Terms of Service</a></li>
                <li><a href={finixPrivacyUrl} target="_blank" rel="noopener noreferrer" className="text-wgc-navy-600 font-medium hover:underline">Finix Privacy Policy</a></li>
              </ul>
              <p>
                Finix is an express third-party beneficiary of WGC’s Terms.
              </p>
            </section>

            <section id="nonprofit-eligibility-and-verification">
              <h2 className="text-2xl font-bold text-wgc-navy-900 mb-4 tracking-tight">Nonprofit Eligibility and Verification</h2>
              <p className="mb-4">
                WGC Payments provides donation-processing services exclusively to validated, registered nonprofit organizations. WGC Payments does not permit individuals, unregistered organizations, for-profit businesses, or organizations that have not completed verification to collect charitable donations through the platform.
              </p>
              <p className="mb-4">
                Before an organization is approved to accept donations, including donations made using Google Pay, WGC Payments requires the organization to provide documentation confirming its nonprofit status. For organizations operating in the United States, this documentation includes the organization’s legal name, Employer Identification Number (EIN), and valid IRS documentation confirming recognition as a tax-exempt organization under Section 501(c)(3).
              </p>
              <p className="mb-4">
                WGC Payments reviews the submitted documentation and may verify the organization’s information against applicable government records, including the IRS Tax Exempt Organization Search, and through the underwriting and verification procedures of our payment-processing partners.
              </p>
              <p className="mb-4">
                Donation processing and digital-wallet payment methods will not be enabled while verification is pending. Organizations that cannot provide satisfactory proof of nonprofit status, provide inaccurate information, or lose their qualifying nonprofit status may be rejected, suspended, or removed from the WGC Payments platform.
              </p>
              <p>
                Each organization is responsible for promptly notifying WGC Payments of any change to its legal name, tax-exempt status, registration, operations, or other information submitted during verification.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-wgc-navy-900 mb-4 tracking-tight">4. Authorization to Share Information</h2>
              <p>
                Organization authorizes WGC to collect, store, process, and share organization/sub-merchant information with Finix, sponsor banks, processors, and required service providers for onboarding, underwriting, payment processing, dispute handling, risk review, compliance, payouts, and support.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-wgc-navy-900 mb-4 tracking-tight">5. Authorization for WGC to Act on Behalf of Organization</h2>
              <p>
                Organization authorizes WGC to communicate with Finix on its behalf for onboarding, payment processing, refunds, disputes, ACH returns, payout support, compliance, account updates, and issue resolution. Organization authorizes WGC to transmit relevant information to Finix when necessary.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-wgc-navy-900 mb-4 tracking-tight">6. Accurate Information</h2>
              <p>
                Organization must provide true, complete, and current business, owner, control person, processing, refund policy, website, tax, and payout bank information. Organization must promptly update WGC/Finix if information changes.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-wgc-navy-900 mb-4 tracking-tight">7. Payout Bank Account</h2>
              <p>
                The payout bank account must belong to the organization or be a legitimate business/organization account approved for payouts. Full bank account information is collected through secure Finix onboarding/update flows. WGC does not display full bank account or routing details. Payout bank changes must be completed securely through the Finix hosted onboarding/update flow. Payouts may be paused while new bank information is verified.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-wgc-navy-900 mb-4 tracking-tight">8. Fees</h2>
              <p>
                WGC may charge application/platform fees on donations. WGC may charge a monthly platform/base fee. Processor/network/pass-through fees may apply. Refund, ACH return, dispute, chargeback, network, processor, financial institution, and pass-through fees may apply.
              </p>
              <p className="mt-4">
                WGC may deduct application/platform fees through Finix from processed donations. Monthly platform fees may be billed separately. Pricing may vary by organization agreement. WGC will provide prior notice before fee changes (at least 30 days where practical/required). 
              </p>
              <p className="mt-4">
                See our full <Link href="/legal/fees" className="text-wgc-navy-600 font-medium hover:underline">Fee Schedule</Link> for details.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-wgc-navy-900 mb-4 tracking-tight">9. Payment Processing</h2>
              <p>
                Payments are processed through Finix/processor/bank services. Approval is subject to underwriting, risk review, compliance review, and Finix/processor/sponsor bank approval. Finix or processor may approve, reject, suspend, terminate, request more information, hold funds, reserve funds, or impose limitations.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-wgc-navy-900 mb-4 tracking-tight">10. Refunds</h2>
              <p>
                Organization must maintain a clear refund policy. Organization is responsible for refund decisions and donor communication. Refunds cannot exceed the original transaction amount unless allowed by rules/law. Cash refunds for card/ACH donations should not be allowed except where legally required or permitted. Refund-related fees may apply.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-wgc-navy-900 mb-4 tracking-tight">11. Disputes, Chargebacks, ACH Returns</h2>
              <p>
                Organization is responsible for donor disputes, chargebacks, ACH returns, failed payments, reversals, and related costs. Organization must respond to disputes by deadlines. WGC may help display and transmit dispute information, but outcomes are not guaranteed. Lost disputes may reduce payouts or create amounts owed.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-wgc-navy-900 mb-4 tracking-tight">12. Payouts / Settlements</h2>
              <p>
                Payouts are subject to settlement timing, processor/bank review, risk controls, reserves, holds, ACH returns, disputes, and chargebacks. WGC does not receive settlement funds on behalf of organizations. Payouts should go to the organization/sub-merchant’s approved payout bank account through Finix/processor. Dashboard payout data may be informational and should be reconciled by the organization.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-wgc-navy-900 mb-4 tracking-tight">13. Compliance</h2>
              <p>
                Organization must comply with applicable law, payment network rules, Finix terms, WGC terms, ACH rules, card network rules, and required website/refund policy rules. Organization must not use WGC/Finix for prohibited or restricted businesses or illegal activity.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-wgc-navy-900 mb-4 tracking-tight">14. Website / Donor-Facing Requirements</h2>
              <p>
                Organization is responsible for maintaining required donor-facing disclosures, including organization identity, contact info, refund policy, donation/payment description, and any required tax/charitable disclosures.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-wgc-navy-900 mb-4 tracking-tight">15. Security / PCI / Data</h2>
              <p>
                WGC uses Finix Tokenization Forms for sensitive payment information. WGC should not store raw PAN, CVV, or full bank details. Organization must protect its login credentials and notify WGC immediately of unauthorized access.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-wgc-navy-900 mb-4 tracking-tight">16. Suspension / Termination</h2>
              <p>
                WGC may suspend or terminate access for compliance, risk, non-payment, suspected fraud, dispute issues, inaccurate information, violation of terms, or Finix/processor instruction.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-wgc-navy-900 mb-4 tracking-tight">17. Changes to Terms</h2>
              <p>
                WGC may update terms with notice. Continued use after notice means acceptance.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-wgc-navy-900 mb-4 tracking-tight">18. Support</h2>
              <p>
                For questions, support, or issues regarding your account, please contact us at <strong>support@wgcpayments.com</strong>.
              </p>
            </section>

          </div>

          {/* Background branding */}
          <div className="absolute -right-20 -bottom-20 opacity-[0.02] pointer-events-none select-none text-[12rem] font-black text-wgc-navy-900 leading-none">TERMS</div>
        </div>

        <p className="text-slate-500 font-medium tracking-tight mt-8 opacity-80 text-center text-sm">Last updated July 2026.</p>
        
        <div className="mt-12 text-center">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-wgc-navy-900 transition-colors uppercase tracking-widest font-mono">
            <ArrowLeft className="w-4 h-4" /> Back to Home
          </Link>
        </div>
        
      </div>
    </div>
  );
}
