"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Archive, Loader2, Pencil, Plus, RotateCcw } from "lucide-react";
import { useConfirm } from "@/components/common/ConfirmDialog";

const input =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500";

async function send(url: string, method: "POST" | "PATCH", body: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Something went wrong.");
}

/** Add or rename a fund (name + optional description), in a modal. */
function FundForm({
  title,
  initialName = "",
  initialDescription = "",
  submitLabel,
  onSubmit,
  onClose,
}: {
  title: string;
  initialName?: string;
  initialDescription?: string;
  submitLabel: string;
  onSubmit: (name: string, description: string) => Promise<void>;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (ref.current && !ref.current.open) ref.current.showModal();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSubmit(name.trim(), description.trim());
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-labelledby="fund-form-title"
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl backdrop:bg-slate-900/50"
    >
      <form onSubmit={submit} className="space-y-4 p-6">
        <h2 id="fund-form-title" className="text-base font-bold text-slate-900">
          {title}
        </h2>
        <label className="block text-xs font-semibold text-slate-600">
          Fund name
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required className={`${input} mt-1`} />
        </label>
        <label className="block text-xs font-semibold text-slate-600">
          Description <span className="font-normal text-slate-400">(optional, shown to donors)</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} className={`${input} mt-1`} />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {submitLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}

export function AddFundButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
        Add fund
      </button>
      {open && (
        <FundForm
          title="Add a fund"
          submitLabel="Add fund"
          onClose={() => setOpen(false)}
          onSubmit={async (name, description) => {
            await send("/api/merchant/funds", "POST", { name, description });
            toast.success("Fund added.");
            router.refresh();
          }}
        />
      )}
    </>
  );
}

export default function FundActions({
  fundId,
  name,
  description,
  isActive,
}: {
  fundId: string;
  name: string;
  description: string | null;
  isActive: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, confirmDialog] = useConfirm();
  const btn = "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-60";

  async function setActive(next: boolean) {
    if (!next) {
      const ok = await confirm({
        title: `Archive "${name}"?`,
        body: "Donors won't be able to choose it on giving pages any more. Past gifts keep their fund, and you can restore it any time.",
        confirmLabel: "Archive fund",
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      await send(`/api/merchant/funds/${fundId}`, "PATCH", { isActive: next });
      toast.success(next ? "Fund restored." : "Fund archived.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {confirmDialog}
      <button type="button" onClick={() => setEditing(true)} className={`${btn} text-slate-600 hover:bg-slate-100`} aria-label={`Rename ${name}`}>
        <Pencil className="h-3.5 w-3.5" aria-hidden />
      </button>
      {isActive ? (
        <button type="button" disabled={busy} onClick={() => setActive(false)} className={`${btn} text-slate-600 hover:bg-slate-100`} aria-label={`Archive ${name}`}>
          <Archive className="h-3.5 w-3.5" aria-hidden />
        </button>
      ) : (
        <button type="button" disabled={busy} onClick={() => setActive(true)} className={`${btn} text-indigo-600 hover:bg-indigo-50`}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Restore
        </button>
      )}
      {editing && (
        <FundForm
          title="Edit fund"
          initialName={name}
          initialDescription={description ?? ""}
          submitLabel="Save"
          onClose={() => setEditing(false)}
          onSubmit={async (newName, newDescription) => {
            await send(`/api/merchant/funds/${fundId}`, "PATCH", { name: newName, description: newDescription });
            toast.success("Fund updated.");
            router.refresh();
          }}
        />
      )}
    </>
  );
}
