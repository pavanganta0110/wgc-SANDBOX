import SettingsNav from "@/components/merchant/SettingsNav";
import { getPaymentWording } from "@/lib/settings/paymentWording";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { pw } = await getPaymentWording();
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-bold text-slate-900">Settings</h2>
        <p className="text-sm text-slate-500 mt-1">
          {pw("Manage your organization's giving, payment, branding, team, security, and communication preferences.")}
        </p>
      </div>
      <div className="flex flex-col lg:flex-row gap-6">
        <SettingsNav />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
