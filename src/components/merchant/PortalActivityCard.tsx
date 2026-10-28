import type { PortalActivity } from "@/lib/donorPortal/portalActivity";

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-xl font-semibold text-slate-900">{value.toLocaleString("en-US")}</p>
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

/** How donors are using the portal — counts only, never who. The per-donor "signed in" marker lives on the Donors list. */
export default function PortalActivityCard({ activity }: { activity: PortalActivity }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat label="Donors signed in" value={activity.signedInPeople} hint="people, ever" />
      <Stat label="Active, last 30 days" value={activity.activeLast30Days} />
      <Stat label="Invites sent" value={activity.invitesSent} />
      <Stat
        label="Changed by donors"
        value={activity.amountChangesByDonors + activity.cancellationsByDonors}
        hint={`${activity.amountChangesByDonors} amount, ${activity.cancellationsByDonors} canceled`}
      />
    </div>
  );
}
