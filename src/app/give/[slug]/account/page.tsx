import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireDonorSession, DonorAuthError } from "@/lib/donorPortal/donorAuth";
import { loadDonorPortalDashboard } from "@/lib/donorPortal/donorPortalData";
import { formatCents } from "@/lib/format";
import { frequencyLabel } from "@/lib/subscriptions/subscriptionStatus";
import OrganizationBrandHeader from "@/components/merchant/OrganizationBrandHeader";
import PoweredByWgc from "@/components/merchant/PoweredByWgc";
import { resolvePortalAccent } from "@/lib/donorPortal/portalBrand";
import DonorPortalLoginForm from "@/components/donorPortal/DonorPortalLoginForm";
import RecurringGiftActions from "@/components/donorPortal/RecurringGiftActions";
import DonorPortalLogoutButton from "@/components/donorPortal/DonorPortalLogoutButton";

export const metadata: Metadata = { title: "My Giving", robots: { index: false, follow: false } };

const dateFormat = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });

function giftStatusLabel(status: string): string {
  if (status === "SUCCEEDED") return "Completed";
  if (status === "PENDING") return "Pending";
  if (status === "FAILED") return "Failed";
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export default async function DonorAccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ linkError?: string }>;
}) {
  const { slug } = await params;
  const { linkError } = await searchParams;

  const church = await prisma.church.findUnique({ where: { slug }, select: { name: true, slug: true, logoUrl: true, primaryColor: true } });
  if (!church) notFound();

  const accent = resolvePortalAccent(church.primaryColor);
  const accentStyle = { "--portal-accent": accent } as React.CSSProperties;

  let session;
  try {
    session = await requireDonorSession(slug);
  } catch (err) {
    if (!(err instanceof DonorAuthError)) throw err;
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4 py-10" style={accentStyle}>
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
          <OrganizationBrandHeader logoUrl={church.logoUrl} organizationName={church.name} kind="My Giving" />
          <p className="text-sm text-slate-500 mb-6 text-center">Sign in to see your giving. Use the email you gave with.</p>
          <DonorPortalLoginForm slug={slug} linkError={Boolean(linkError)} />
        </div>
        <PoweredByWgc />
      </div>
    );
  }

  const data = await loadDonorPortalDashboard(session.churchId, session.donorId);
  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-sm text-center bg-white rounded-2xl border border-slate-100 p-8">
          <p className="text-sm text-slate-600">We couldn&rsquo;t find your giving record. Please contact {church.name}.</p>
          <div className="mt-4"><DonorPortalLogoutButton slug={slug} /></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50" style={accentStyle}>
      <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
        <OrganizationBrandHeader logoUrl={data.church?.logoUrl ?? church.logoUrl} organizationName={session.churchName} kind="My Giving" />
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-semibold text-slate-900">{data.donorName ? `Welcome, ${data.donorName}` : "Welcome"}</h1>
          <DonorPortalLogoutButton slug={slug} />
        </div>

        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-slate-100 bg-white p-4">
            <p className="text-xs text-slate-500">This year</p>
            <p className="text-xl font-semibold text-slate-900">{formatCents(data.yearToDate.netDonatedCents)}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-white p-4">
            <p className="text-xs text-slate-500">All time</p>
            <p className="text-xl font-semibold text-slate-900">{formatCents(data.lifetime.netDonatedCents)}</p>
            <p className="text-xs text-slate-400">{data.lifetime.donationCount} gifts</p>
          </div>
        </section>
        {data.lifetime.recordedByChurchCents > 0 && (
          <p className="text-xs text-slate-500">
            Totals include {formatCents(data.lifetime.recordedByChurchCents)} that {session.churchName} recorded directly (for example cash or checks).
          </p>
        )}

        <section className="rounded-xl border border-slate-100 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Recurring gifts</h2>
          {data.recurring.length === 0 ? (
            <p className="text-sm text-slate-500">You have no active recurring gifts.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.recurring.map((r) => (
                <li key={r.id} className="py-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-700">
                      {formatCents(r.amountCents ?? 0)} {frequencyLabel(r.billingInterval).toLowerCase()}
                      {r.fundName ? ` · ${r.fundName}` : ""}
                    </span>
                    <span className="text-slate-500">{r.nextBillingDate ? `Next: ${dateFormat.format(r.nextBillingDate)}` : ""}</span>
                  </div>
                  <RecurringGiftActions slug={slug} subscriptionId={r.id} donationAmountCents={r.donationAmountCents ?? (r.donorCoversFee ? null : r.amountCents)} isPledge={r.isPledge} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {data.statements.length > 0 && (
          <section className="rounded-xl border border-slate-100 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Annual giving statements</h2>
            <ul className="divide-y divide-slate-100">
              {data.statements.map((st) => (
                <li key={st.id} className="py-2 flex justify-between text-sm">
                  <span className="text-slate-700">{st.taxYear} · {formatCents(st.eligibleAmountCents)}</span>
                  <a href={`/api/donor-portal/statements/${st.id}?slug=${encodeURIComponent(slug)}`} className="text-[var(--portal-accent)] hover:opacity-80">Download PDF</a>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="rounded-xl border border-slate-100 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Ways to give</h2>
          {data.waysToGive.length === 0 ? (
            <p className="text-sm text-slate-500">No giving options are open right now.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {data.waysToGive.map((w) => (
                <li key={w.href}>
                  <a href={w.href} className="block rounded-lg border border-slate-200 p-3 hover:border-[var(--portal-accent)]">
                    <p className="text-sm font-medium text-slate-900">{w.title}</p>
                    {w.description && <p className="text-xs text-slate-500 line-clamp-2">{w.description}</p>}
                    <p className="text-xs text-[var(--portal-accent)] mt-1">{w.kind === "CAMPAIGN" ? "Campaign" : "Give"} →</p>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-slate-100 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Giving history</h2>
          {data.gifts.length === 0 ? (
            <p className="text-sm text-slate-500">No gifts yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 font-medium">Gave to</th>
                  <th className="pb-2 font-medium">Fund</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium text-right">Amount</th>
                  <th className="pb-2 pl-4 font-medium text-right">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.gifts.map((g) => (
                  <tr key={`${g.source}-${g.id}`}>
                    <td className="py-2 text-slate-700">{g.date ? dateFormat.format(g.date) : "—"}</td>
                    <td className="py-2 text-slate-700">{g.givingLinkTitle ?? (g.source === "RECORDED_BY_CHURCH" ? "Recorded by church" : "—")}</td>
                    <td className="py-2 text-slate-500">{g.fundName ?? "General"}</td>
                    <td className="py-2 text-slate-500">
                      {giftStatusLabel(g.status)}
                      {g.source === "RECORDED_BY_CHURCH" ? " · recorded by church" : ""}
                    </td>
                    <td className="py-2 text-right text-slate-900">{formatCents(g.amountCents)}</td>
                    <td className="py-2 pl-4 text-right">
                      {g.receipt ? (
                        <a href={`/api/donor-portal/receipts/${g.receipt.kind}/${g.receipt.id}?slug=${encodeURIComponent(slug)}`} className="text-[var(--portal-accent)] hover:opacity-80">Download</a>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <PoweredByWgc />
      </div>
    </div>
  );
}
