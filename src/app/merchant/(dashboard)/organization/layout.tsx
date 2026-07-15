import OrganizationNav from "@/components/merchant/OrganizationNav";

export default function OrganizationLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-bold text-slate-900">Organization Profile</h2>
        <p className="text-sm text-slate-500 mt-1">
          Your organization's legal identity, verification status, bank account, and documents on file with WGC Payments.
        </p>
      </div>
      <div className="flex flex-col lg:flex-row gap-6">
        <OrganizationNav />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
