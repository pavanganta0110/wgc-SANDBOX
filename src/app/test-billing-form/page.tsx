import ActivationForm from "@/components/billing/ActivationForm";

export default function TestBillingFormPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-12">
      <ActivationForm
        token="mock-token-123"
        organizationName="Waypoint Gateway Collective (Preview)"
        isPromotional={true}
        durationMonths={6}
        regularMonthlyAmountCents={4900}
      />
    </div>
  );
}
