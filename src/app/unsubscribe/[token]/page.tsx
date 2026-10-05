import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import OrganizationBrandHeader from "@/components/merchant/OrganizationBrandHeader";
import PoweredByWgc from "@/components/merchant/PoweredByWgc";
import UnsubscribeButton from "@/components/giving/UnsubscribeButton";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false, follow: false } };

export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const recipient = /^[a-f0-9]{16,128}$/i.test(token) ? await prisma.givingCampaignRecipient.findUnique({ where: { trackingToken: token } }) : null;
  const church = recipient ? await prisma.church.findUnique({ where: { id: recipient.churchId }, select: { name: true, logoUrl: true } }) : null;

  return (
    <div className="min-h-screen py-12 px-4 bg-slate-50">
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
        {church && recipient?.recipientEmail ? (
          <>
            <OrganizationBrandHeader logoUrl={church.logoUrl} organizationName={church.name} kind="Email preferences" />
            <UnsubscribeButton token={token} organizationName={church.name} />
          </>
        ) : (
          <div className="text-center">
            <h1 className="text-lg font-bold text-slate-900 mb-2">This link isn&apos;t valid</h1>
            <p className="text-sm text-slate-500">The unsubscribe link may have been copied incorrectly. If you keep getting emails you don&apos;t want, reply to one of them and ask to be removed.</p>
          </div>
        )}
        <PoweredByWgc />
      </div>
    </div>
  );
}
