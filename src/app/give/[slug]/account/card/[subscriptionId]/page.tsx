import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireDonorSession, DonorAuthError } from "@/lib/donorPortal/donorAuth";
import { loadDonorCardUpdateContext, DonorSubscriptionError } from "@/lib/donorPortal/donorSubscriptions";
import { resolvePortalAccent } from "@/lib/donorPortal/portalBrand";
import { formatCents } from "@/lib/format";
import { frequencyLabel } from "@/lib/subscriptions/subscriptionStatus";
import DonorCardUpdateForm from "@/components/donorPortal/DonorCardUpdateForm";
import OrganizationBrandHeader from "@/components/merchant/OrganizationBrandHeader";
import PoweredByWgc from "@/components/merchant/PoweredByWgc";

export const metadata: Metadata = { title: "Update card", robots: { index: false, follow: false } };

export default async function DonorCardUpdatePage({ params }: { params: Promise<{ slug: string; subscriptionId: string }> }) {
  const { slug, subscriptionId } = await params;
  const church = await prisma.church.findUnique({ where: { slug }, select: { name: true, logoUrl: true, primaryColor: true } });
  if (!church) notFound();

  let session;
  try {
    session = await requireDonorSession(slug);
  } catch (err) {
    if (err instanceof DonorAuthError) redirect(`/give/${slug}/account`);
    throw err;
  }

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-slate-50 px-4 py-10" style={{ "--portal-accent": resolvePortalAccent(church.primaryColor) } as React.CSSProperties}>
      <div className="mx-auto max-w-lg rounded-2xl border border-slate-100 bg-white p-8 shadow-sm">
        <OrganizationBrandHeader logoUrl={church.logoUrl} organizationName={church.name} kind="Update Card" />
        {children}
      </div>
      <PoweredByWgc />
    </div>
  );

  let context;
  try {
    context = await loadDonorCardUpdateContext({ churchId: session.churchId, sessionDonorId: session.donorId, subscriptionId });
  } catch (err) {
    if (!(err instanceof DonorSubscriptionError)) throw err;
    return shell(
      <div className="text-center">
        <p className="mb-4 text-sm text-slate-600">{err.message}</p>
        <a href={`/give/${slug}/account`} className="text-sm font-semibold text-[var(--portal-accent)]">Back to my giving</a>
      </div>,
    );
  }

  return shell(
    <>
      <div className="mb-6 space-y-1.5 rounded-xl bg-slate-50 p-4 text-sm">
        <div className="flex justify-between"><span className="text-slate-500">Recurring gift</span><span className="font-bold text-slate-900">{formatCents(context.amountCents ?? 0)} {frequencyLabel(context.billingInterval).toLowerCase()}</span></div>
        {context.currentCard && <div className="flex justify-between"><span className="text-slate-500">Current card</span><span className="font-semibold text-slate-800">{context.currentCard.brand ?? "Card"} •••• {context.currentCard.last4 ?? "—"}</span></div>}
      </div>
      <DonorCardUpdateForm slug={slug} subscriptionId={subscriptionId} organizationName={church.name} />
    </>,
  );
}
