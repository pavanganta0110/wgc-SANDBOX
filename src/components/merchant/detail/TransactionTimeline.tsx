import { formatDateTimeCDT as formatDateTime } from "@/lib/formatDateTimeCDT";

export type TimelineEvent = {
  label: string;
  sublabel?: string;
  date: Date | string | null;
  actor?: string;
};

export function TransactionTimeline({ events }: { events: TimelineEvent[] }) {
  return (
    <div className="space-y-4">
      {events.map((event, i) => (
        <div key={i} className="flex gap-3">
          <div className="flex flex-col items-center pt-1">
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            {i < events.length - 1 && <span className="w-px flex-1 bg-slate-200 mt-1" />}
          </div>
          <div className="pb-1">
            <p className="text-sm font-semibold text-slate-800">{event.label}</p>
            {event.sublabel && <p className="text-xs text-slate-500">{event.sublabel}</p>}
            <p className="text-xs text-slate-400">
              {formatDateTime(event.date)}
              {event.actor && <span> · {event.actor}</span>}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
