"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ShieldAlert, X } from "lucide-react";

export interface ConfirmOptions {
  title: string;
  /** Main explanation. Strings are split into paragraphs on blank lines. */
  body?: ReactNode;
  /** Optional highlighted note (e.g. privacy or "can't be undone"). */
  callout?: { title: string; body: ReactNode };
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
}

function Paragraphs({ body }: { body: ReactNode }) {
  if (typeof body !== "string") return <>{body}</>;
  return (
    <>
      {body.split(/\n{2,}/).map((p) => (
        <p key={p}>{p}</p>
      ))}
    </>
  );
}

/**
 * In-app replacement for window.confirm(). Uses the native <dialog> element in
 * modal mode, so focus is trapped, Escape cancels, and the page behind is inert.
 *
 *   const [confirm, confirmDialog] = useConfirm();
 *   if (await confirm({ title: "Merge donors?" })) { ... }
 *   return <>{...}{confirmDialog}</>;
 */
export function useConfirm(): [(options: ConfirmOptions) => Promise<boolean>, ReactNode] {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((next: ConfirmOptions) => {
    resolver.current?.(false);
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOptions(null);
  }, []);

  const dialog = options ? <ConfirmDialog options={options} onSettle={settle} /> : null;
  return [confirm, dialog];
}

function ConfirmDialog({ options, onSettle }: { options: ConfirmOptions; onSettle: (ok: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const danger = options.tone === "danger";

  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
    // Default focus on Cancel so Enter never confirms by accident.
    cancelRef.current?.focus();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby="confirm-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        onSettle(false);
      }}
      onClick={(e) => {
        // Click on the backdrop (outside the panel) cancels.
        if (e.target === ref.current) onSettle(false);
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-slate-200 bg-white p-0 text-slate-700 shadow-2xl backdrop:bg-slate-900/50 backdrop:backdrop-blur-[2px]"
    >
      <div className="flex max-h-[85vh] flex-col">
        <div className="flex items-start gap-3 px-6 pt-6">
          <span
            className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${danger ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600"}`}
            aria-hidden
          >
            <AlertTriangle className="h-5 w-5" />
          </span>
          <h2 id="confirm-dialog-title" className="flex-1 pt-1.5 text-base font-bold text-slate-900">
            {options.title}
          </h2>
          <button
            type="button"
            onClick={() => onSettle(false)}
            className="rounded-lg p-1 text-slate-400 outline-none hover:bg-slate-100 hover:text-slate-600 focus-visible:ring-2 focus-visible:ring-slate-400"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto px-6 pb-2 pt-3 text-sm leading-relaxed sm:pl-[4.5rem]">
          {options.body && <Paragraphs body={options.body} />}
          {options.callout && (
            <div className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
              <div className="space-y-1">
                <p className="font-semibold">{options.callout.title}</p>
                <div className="space-y-2 text-[13px]">
                  <Paragraphs body={options.callout.body} />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-2 flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={() => onSettle(false)}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            {options.cancelLabel ?? "Cancel"}
          </button>
          <button
            type="button"
            onClick={() => onSettle(true)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${danger ? "bg-red-600 hover:bg-red-700 focus-visible:ring-red-500" : "bg-slate-900 hover:bg-slate-800 focus-visible:ring-slate-500"}`}
          >
            {options.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
