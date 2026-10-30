import { Clock } from "lucide-react";

export const metadata = { title: "Session ended | WGC Payments" };

/** Shown inside a partner's frame when the person's WGC session has ended. */
export default function PartnerEmbedEndedPage() {
  return (
    <main className="max-w-xl w-full mx-auto px-6 py-16 flex flex-col items-center text-center">
      <div className="w-16 h-16 rounded-full flex items-center justify-center mb-6 bg-slate-100 text-slate-600">
        <Clock className="w-8 h-8" />
      </div>
      <h1 className="text-2xl font-bold text-slate-900 mb-3">Your session has ended</h1>
      <div className="text-slate-600 space-y-3">
        <p>For your security WGC Payments signs you out after a few hours. Open WGC Payments again from where you came to continue.</p>
      </div>
    </main>
  );
}
