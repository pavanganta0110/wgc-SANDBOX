"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Copy, Link2, Loader2, Plus, Upload } from "lucide-react";

const input =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500";
const primaryBtn =
  "inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60";
const ghostBtn =
  "inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60";

async function call<T = unknown>(url: string, method: "POST" | "PATCH", body: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data as T;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (ref.current && !ref.current.open) ref.current.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="m-auto w-[min(92vw,560px)] rounded-2xl border border-slate-200 p-0 shadow-xl backdrop:bg-slate-900/40"
    >
      <div className="space-y-4 p-6">
        <h3 className="text-base font-bold text-slate-900">{title}</h3>
        {children}
      </div>
    </dialog>
  );
}

/** Shown on the Students page until the organization turns the feature on. */
export function EnableStudentGivingCard({ canManage }: { canManage: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function enable() {
    setBusy(true);
    try {
      await call("/api/merchant/students/settings", "POST", { enabled: true });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <h2 className="text-lg font-bold text-slate-900">Student Giving</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">
        Tie gifts to individual students and see, per term, who is fully credited and who gave. Upload a roster, let donors choose a student on your
        giving pages, and export a reconciliation file for your finance team.
      </p>
      {canManage ? (
        <button onClick={enable} disabled={busy} className={`${primaryBtn} mt-5`}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Turn on Student Giving
        </button>
      ) : (
        <p className="mt-5 text-sm text-slate-500">Ask an organization admin to turn this on.</p>
      )}
    </div>
  );
}

/** Sets the term that the public picker credits gifts to. */
export function CurrentTermForm({ currentTerm }: { currentTerm: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState(currentTerm ?? "");
  const [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await call("/api/merchant/students/settings", "POST", { currentTerm: value.trim() || null });
      toast.success("Current term saved");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="flex items-end gap-2">
      <label className="text-xs font-semibold text-slate-500">
        Current term (used on giving pages)
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Fall 2026" className={`${input} mt-1 w-48`} maxLength={40} />
      </label>
      <button type="submit" disabled={busy || value.trim() === (currentTerm ?? "")} className={ghostBtn}>
        Save
      </button>
    </form>
  );
}

export function AddStudentButton({ defaultTerm }: { defaultTerm: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ studentNumber: "", firstName: "", lastName: "", email: "", termLabel: defaultTerm ?? "", charge: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await call("/api/merchant/students", "POST", f);
      toast.success("Student added");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button onClick={() => setOpen(true)} className={ghostBtn}>
        <Plus className="h-4 w-4" aria-hidden /> Add student
      </button>
      {open && (
        <Modal title="Add student" onClose={() => setOpen(false)}>
          <form onSubmit={submit} className="space-y-3">
            <input required value={f.studentNumber} onChange={set("studentNumber")} placeholder="Student ID" className={input} />
            <div className="grid grid-cols-2 gap-2">
              <input value={f.firstName} onChange={set("firstName")} placeholder="First name" className={input} />
              <input value={f.lastName} onChange={set("lastName")} placeholder="Last name" className={input} />
            </div>
            <input type="email" value={f.email} onChange={set("email")} placeholder="Email (optional)" className={input} />
            <div className="grid grid-cols-2 gap-2">
              <input value={f.termLabel} onChange={set("termLabel")} placeholder="Term (e.g. Fall 2026)" className={input} />
              <input value={f.charge} onChange={set("charge")} placeholder="Charge (e.g. 4200)" className={input} inputMode="decimal" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setOpen(false)} className={ghostBtn}>Cancel</button>
              <button type="submit" disabled={busy} className={primaryBtn}>Add</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

type ImportPreview = {
  committed: boolean;
  summary: { totalRows: number; validRows: number; errorRows: number; studentsToCreate: number; studentsToUpdate: number; chargesToSet: number };
  errors: { rowNumber: number; studentNumber: string; errors: string[] }[];
};

/** Roster / charges CSV upload with a no-write preview before committing. */
export function ImportStudentsButton({ defaultTerm }: { defaultTerm: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [term, setTerm] = useState(defaultTerm ?? "");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(commit: boolean) {
    setBusy(true);
    try {
      const res = await call<ImportPreview>("/api/merchant/students/import", "POST", { csv, defaultTerm: term, commit });
      setPreview(res);
      if (commit) {
        toast.success(`Imported ${res.summary.validRows} rows`);
        setOpen(false);
        setCsv("");
        setPreview(null);
        router.refresh();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className={ghostBtn}>
        <Upload className="h-4 w-4" aria-hidden /> Import CSV
      </button>
      {open && (
        <Modal title="Import students and charges" onClose={() => setOpen(false)}>
          <p className="text-xs text-slate-500">
            Columns: <strong>Student ID</strong>, <strong>First Name</strong>, <strong>Last Name</strong> (or <strong>Name</strong>), Email (optional), and
            optionally <strong>Term</strong> + <strong>Charge</strong>. Re-uploading updates existing students by Student ID.
          </p>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setFileName(file.name);
              setCsv(await file.text());
              setPreview(null);
            }}
            className="block w-full text-sm"
          />
          <label className="block text-xs font-semibold text-slate-500">
            Term for rows that have a charge but no Term column
            <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Fall 2026" className={`${input} mt-1`} />
          </label>
          {preview && (
            <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
              <p>
                {preview.summary.validRows} of {preview.summary.totalRows} rows ready · {preview.summary.studentsToCreate} new, {preview.summary.studentsToUpdate}{" "}
                updated, {preview.summary.chargesToSet} charges
              </p>
              {preview.errors.length > 0 && (
                <ul className="mt-2 max-h-32 list-disc overflow-auto pl-5 text-xs text-red-700">
                  {preview.errors.map((er) => (
                    <li key={er.rowNumber}>
                      Row {er.rowNumber}
                      {er.studentNumber ? ` (${er.studentNumber})` : ""}: {er.errors.join("; ")}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setOpen(false)} className={ghostBtn}>Cancel</button>
            <button type="button" disabled={!csv || busy} onClick={() => run(false)} className={ghostBtn}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Preview{fileName ? "" : ""}
            </button>
            <button type="button" disabled={!preview || preview.summary.validRows === 0 || busy} onClick={() => run(true)} className={primaryBtn}>
              Import valid rows
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

/** Creates (or fetches) the student's own giving link, shows it to copy. */
export function StudentGivingLinkButton({ studentId, termLabel }: { studentId: string; termLabel: string | null }) {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  async function make() {
    setBusy(true);
    try {
      const res = await call<{ link: { publicSlug: string } }>(`/api/merchant/students/${studentId}/giving-link`, "POST", { termLabel });
      setUrl(`${window.location.origin}/g/${res.link.publicSlug}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }
  if (url) {
    return (
      <div className="flex items-center gap-2">
        <input readOnly value={url} className={`${input} w-72`} onFocus={(e) => e.currentTarget.select()} />
        <button
          className={ghostBtn}
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            toast.success("Link copied");
          }}
        >
          <Copy className="h-4 w-4" aria-hidden /> Copy
        </button>
      </div>
    );
  }
  return (
    <button onClick={make} disabled={busy} className={ghostBtn}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />} Create giving link
    </button>
  );
}

export function SetChargeForm({ studentId, termLabel }: { studentId: string; termLabel: string }) {
  const router = useRouter();
  const [charge, setCharge] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await call(`/api/merchant/students/${studentId}`, "PATCH", { termLabel, charge });
      setCharge("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="flex items-center gap-2">
      <input value={charge} onChange={(e) => setCharge(e.target.value)} placeholder={`${termLabel} charge`} className={`${input} w-40`} inputMode="decimal" />
      <button type="submit" disabled={busy || !charge.trim()} className={ghostBtn}>Set charge</button>
    </form>
  );
}

type StudentOption = { id: string; name: string };

/** Assign or move one gift to a student for a term (writes an audit row). */
export function AssignGiftControl({
  gift,
  students,
  termLabel,
}: {
  gift: { paymentId?: string; externalDonationId?: string; currentStudentId: string | null };
  students: StudentOption[];
  termLabel: string | null;
}) {
  const router = useRouter();
  const [studentId, setStudentId] = useState(gift.currentStudentId ?? "");
  const [givenFor, setGivenFor] = useState<"SPONSOR" | "SELF">("SPONSOR");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await call("/api/merchant/students/assign", "POST", { ...gift, studentId, termLabel, givenFor });
      toast.success("Gift assigned");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex items-center justify-end gap-1.5">
      <select value={studentId} onChange={(e) => setStudentId(e.target.value)} className="h-9 max-w-44 rounded-lg border border-slate-200 bg-white px-2 text-xs">
        <option value="">Choose student…</option>
        {students.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      <select value={givenFor} onChange={(e) => setGivenFor(e.target.value as "SPONSOR" | "SELF")} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs">
        <option value="SPONSOR">Sponsor</option>
        <option value="SELF">Self-paid</option>
      </select>
      <button onClick={save} disabled={busy || !studentId || !termLabel} className="rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
        Assign
      </button>
    </div>
  );
}
