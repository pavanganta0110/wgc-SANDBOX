import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { NOTIFICATION_EVENTS, DEFAULT_NOTIFICATION_PREFERENCE } from "@/lib/settings/notificationEvents";
import NotificationSettingsForm from "@/components/merchant/NotificationSettingsForm";

export default async function NotificationSettingsPage() {
  const session = await getSession();
  const rows = await prisma.notificationPreference.findMany({ where: { churchId: session!.churchId! } });
  const byKey = new Map(rows.map((r) => [r.eventKey, r]));

  const preferences = NOTIFICATION_EVENTS.map((event) => {
    const row = byKey.get(event.key);
    return {
      ...event,
      inAppEnabled: row?.inAppEnabled ?? DEFAULT_NOTIFICATION_PREFERENCE.inAppEnabled,
      emailEnabled: row?.emailEnabled ?? DEFAULT_NOTIFICATION_PREFERENCE.emailEnabled,
      frequency: row?.frequency ?? DEFAULT_NOTIFICATION_PREFERENCE.frequency,
    };
  });

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      <h3 className="text-sm font-bold text-slate-900 mb-1">Notifications</h3>
      <p className="text-xs text-slate-500 mb-6">
        Choose which events send an email to your organization's support contact. In-app notifications appear only in this dashboard.
      </p>
      <NotificationSettingsForm initial={preferences} />
    </div>
  );
}
