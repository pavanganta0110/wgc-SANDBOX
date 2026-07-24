import { Suspense } from "react";
import FirstLookPreferencesForm from "@/components/marketing/FirstLookPreferencesForm";

export const metadata = {
  title: "Confirmed | First Look | WGC Payments",
  description: "You're on the list for the live working session.",
};

function DecorativeBar() {
  return (
    <div className="w-full h-[14px] flex">
      <div className="w-1/2 h-full bg-[#E8E0CF]"></div>
      <div className="w-1/2 h-full bg-[#C9992E]"></div>
    </div>
  );
}

function Header() {
  return (
    <header className="w-full bg-[#FFFDF8] border-b border-[rgba(20,33,61,0.13)] px-6 py-4 flex justify-between items-center">
      <div className="flex flex-col">
        <span className="font-serif text-xl font-bold text-[#14213D] leading-none">WGC</span>
        <span className="text-[10px] uppercase font-mono tracking-widest text-[#41506F] mt-1">Waypoint Gateway Collective</span>
      </div>
    </header>
  );
}

export default function ConfirmedPage() {
  return (
    <div className="min-h-screen bg-[#F5F1E8] text-[#14213D] font-sans flex flex-col">
      <DecorativeBar />
      <Header />

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12 md:py-24">
        <div className="max-w-2xl w-full text-center mb-12">
          <div className="w-16 h-16 rounded-full bg-[#E8E0CF] border-2 border-[#C9992E] flex items-center justify-center mx-auto mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#8C5A33" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </div>
          <h1 className="text-4xl md:text-5xl font-serif text-[#14213D] mb-4">You're on the list.</h1>
          <p className="text-lg text-[#41506F] leading-relaxed">
            We'll email you at the address you provided as soon as the live session schedule is locked in. Keep an eye out for an email from Collin.
          </p>
        </div>

        <div className="w-full">
          <Suspense fallback={<div className="h-64 flex items-center justify-center text-sm font-mono text-[#41506F]">Loading...</div>}>
            <FirstLookPreferencesForm />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
