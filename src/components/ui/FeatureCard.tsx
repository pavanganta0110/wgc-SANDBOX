import { LucideIcon } from "lucide-react";

interface FeatureCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

export default function FeatureCard({ icon: Icon, title, description }: FeatureCardProps) {
  return (
    <div className="p-12 bg-white rounded-[2.5rem] border border-wgc-navy-50 shadow-xl hover:shadow-2xl hover:-translate-y-2 transition-all duration-500 h-full flex flex-col group">
      <div className="w-16 h-16 rounded-2xl bg-wgc-navy-50 border border-wgc-navy-100 flex items-center justify-center text-wgc-gold-500 mb-10 group-hover:bg-wgc-gold-500 group-hover:text-wgc-navy-950 transition-all duration-500 shadow-xl">
        <Icon className="w-8 h-8" />
      </div>
      <h3 className="text-2xl font-bold text-wgc-navy-950 mb-6 tracking-tight leading-tight">{title}</h3>
      <p className="text-wgc-navy-500 leading-relaxed text-[13px] font-bold tracking-widest opacity-80">
        {description}
      </p>
    </div>
  );
}
