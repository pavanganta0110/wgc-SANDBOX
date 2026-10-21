import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import PlanningCenterConnectionCard from "@/components/merchant/PlanningCenterConnectionCard";
import PlanningCenterGivingSetup from "@/components/merchant/PlanningCenterGivingSetup";
import PlanningCenterPeople from "@/components/merchant/PlanningCenterPeople";
import PlanningCenterGiftSync from "@/components/merchant/PlanningCenterGiftSync";

export default function PlanningCenterIntegrationPage() {
  return (
    <div>
      <Link href="/merchant/settings/integrations" className="text-sm text-blue-600 hover:underline flex items-center gap-1 mb-4">
        <ArrowLeft className="w-4 h-4" /> Integrations
      </Link>
      <div className="space-y-6">
        <PlanningCenterConnectionCard />
        <PlanningCenterGivingSetup />
        <PlanningCenterPeople />
        <PlanningCenterGiftSync />
      </div>
    </div>
  );
}
