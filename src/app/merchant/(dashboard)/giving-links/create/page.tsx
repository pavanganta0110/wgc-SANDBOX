import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import GivingLinkBuilderForm from "@/components/merchant/GivingLinkBuilderForm";

export default function CreateGivingLinkPage() {
  return (
    <div>
      <Link href="/merchant/giving-links" className="text-sm text-blue-600 hover:underline flex items-center gap-1 mb-4">
        <ArrowLeft className="w-4 h-4" /> All Giving Links
      </Link>
      <h2 className="text-lg font-bold text-slate-900 mb-6">Create Giving Link</h2>
      <GivingLinkBuilderForm mode="create" />
    </div>
  );
}
