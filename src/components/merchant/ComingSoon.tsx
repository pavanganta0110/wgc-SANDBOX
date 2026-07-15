import { LucideIcon } from "lucide-react";

export default function ComingSoon({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-12 flex flex-col items-center text-center max-w-lg mx-auto mt-12">
      <div className="w-14 h-14 rounded-2xl bg-[#eab308]/10 flex items-center justify-center mb-6">
        <Icon className="w-6 h-6 text-[#010409]" />
      </div>
      <h2 className="text-xl font-bold text-slate-900 mb-2">{title}</h2>
      <p className="text-sm text-slate-500">{description}</p>
    </div>
  );
}
