"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import toast from "react-hot-toast";
import { MIGRATION_SOURCE_SYSTEMS, MIGRATION_SOURCE_LABELS, IMPLEMENTED_SOURCE_SYSTEMS, type MigrationSourceSystem } from "@/lib/migrations/types";

export default function NewMigrationJobButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const startMigration = async (sourceSystem: MigrationSourceSystem) => {
    setCreating(true);
    try {
      const res = await fetch("/api/merchant/migrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceSystem }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start migration");
      router.push(`/merchant/migrations/${data.job.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start migration");
      setCreating(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mt-4 sm:mt-0 inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
      >
        New Migration
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-slate-900">Where are you bringing data from?</h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {MIGRATION_SOURCE_SYSTEMS.map((source) => {
                const implemented = IMPLEMENTED_SOURCE_SYSTEMS.includes(source);
                return (
                  <button
                    key={source}
                    disabled={!implemented || creating}
                    onClick={() => startMigration(source)}
                    className={`relative rounded-xl border p-4 text-left text-sm font-medium transition ${
                      implemented ? "border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 text-slate-800" : "border-slate-100 text-slate-400 cursor-not-allowed"
                    }`}
                  >
                    {MIGRATION_SOURCE_LABELS[source]}
                    {!implemented && <span className="absolute top-2 right-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">SOON</span>}
                  </button>
                );
              })}
            </div>
            <p className="mt-4 text-xs text-slate-400">
              Only CSV files can be migrated today. Direct connections to other platforms are on the way — contact support if yours is a priority.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
