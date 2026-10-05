import { LucideIcon } from "lucide-react";

interface FeatureCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Optional pill (e.g. "Coming Soon") rendered next to the title — for a
   * capability that's on the roadmap but not live yet. Only set this for
   * features that genuinely aren't shipped. */
  badge?: string;
}

export default function FeatureCard({ icon: Icon, title, description, badge }: FeatureCardProps) {
  return (
    <div className="p-12 bg-white rounded-[2.5rem] border border-wgc-navy-50 shadow-xl hover:shadow-2xl hover:-translate-y-2 transition-all duration-500 h-full flex flex-col group">
      <div className="w-16 h-16 rounded-2xl bg-wgc-navy-50 border border-wgc-navy-100 flex items-center justify-center text-wgc-gold-500 mb-10 group-hover:bg-wgc-gold-500 group-hover:text-wgc-navy-950 transition-all duration-500 shadow-xl">
        <Icon className="w-8 h-8" />
      </div>
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <h3 className="text-2xl font-bold text-wgc-navy-950 tracking-tight leading-tight">{title}</h3>
        {badge && (
          <span className="px-2.5 py-1 rounded-full bg-wgc-navy-50 border border-wgc-navy-100 text-wgc-navy-400 text-[9px] font-black uppercase tracking-widest">
            {badge}
          </span>
        )}
      </div>
      <p className="text-wgc-navy-500 leading-relaxed text-[13px] font-bold tracking-widest opacity-80">
        {description}
      </p>
    </div>
  );
}
