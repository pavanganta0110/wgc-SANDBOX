import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import PrintfulConnectionCard from "@/components/merchant/PrintfulConnectionCard";

export default function PrintfulIntegrationPage() {
  return (
    <div>
      <Link href="/merchant/settings/integrations" className="text-sm text-blue-600 hover:underline flex items-center gap-1 mb-4">
        <ArrowLeft className="w-4 h-4" /> Integrations
      </Link>
      <PrintfulConnectionCard />
    </div>
  );
}
