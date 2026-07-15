import SettingsNav from "@/components/merchant/SettingsNav";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-bold text-slate-900">Settings</h2>
        <p className="text-sm text-slate-500 mt-1">
          Manage your organization's giving, payment, branding, team, security, and communication preferences.
        </p>
      </div>
      <div className="flex flex-col lg:flex-row gap-6">
        <SettingsNav />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
