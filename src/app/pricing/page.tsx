import PricingCalculator from "@/components/pricing/PricingCalculator";

export default function PricingPage() {
  return (
    <div className="py-24 px-6 bg-slate-50 min-h-screen">
      <div className="max-w-4xl mx-auto text-center mb-16">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 mb-6">
          Simple, transparent <span className="text-[#eab308]">pricing</span>
        </h1>
        <p className="text-lg text-slate-600">
          No hidden fees, no monthly minimums. Just clear rates designed for churches and nonprofits.
        </p>
      </div>
      <PricingCalculator />
    </div>
  );
}
