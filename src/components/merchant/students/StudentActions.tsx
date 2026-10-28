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

type ImportErrorRow = { rowNumber: number; studentNumber: string; errors: string[] };
type ImportResponse =
  | { kind: "roster"; committed: boolean; summary: { totalRows: number; validRows: number; errorRows: number; studentsToCreate: number; studentsToUpdate: number; chargesToSet: number }; errors: ImportErrorRow[]; studentNumbers: string[] }
  | { kind: "gifts"; committed: boolean; summary: { totalRows: number; validRows: number; errorRows: number; giftsToCreate: number; alreadyImported: number; totalCents: number }; errors: ImportErrorRow[] };

type ImportFile = { id: number; name: string; csv: string; result?: ImportResponse; error?: string; state: "ready" | "working" | "done" };

const usd = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

function fileSummary(r: ImportResponse): string {
  if (r.kind === "roster") {
    const s = r.summary;
    return `Roster / charges · ${s.validRows} of ${s.totalRows} rows ready · ${s.studentsToCreate} new, ${s.studentsToUpdate} updated, ${s.chargesToSet} charges`;
  }
  const s = r.summary;
  return `Gifts · ${s.validRows} of ${s.totalRows} rows ready · ${s.giftsToCreate} new gifts (${usd(s.totalCents)})${s.alreadyImported ? `, ${s.alreadyImported} already imported` : ""}`;
}

/**
 * Import one or more CSVs at once: rosters/charges and student gifts, in any
 * order. Preview writes nothing; "Import" saves rosters first (so gifts can
 * find their students), then gifts. Re-importing a file is safe.
 */
export function ImportStudentsButton({ defaultTerm }: { defaultTerm: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<ImportFile[]>([]);
  const [term, setTerm] = useState(defaultTerm ?? "");
  const [busy, setBusy] = useState(false);
  const [previewed, setPreviewed] = useState(false);

  const patch = (id: number, p: Partial<ImportFile>) => setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...p } : f)));

  async function send(csv: string, commit: boolean, alsoKnown: string[]): Promise<ImportResponse> {
    return call<ImportResponse>("/api/merchant/students/import", "POST", { csv, defaultTerm: term, commit, alsoKnown });
  }

  async function previewAll() {
    setBusy(true);
    try {
      // Pass 1 finds out what each file is; pass 2 re-checks gift files knowing
      // which students the roster files in this batch are about to create.
      const known = new Set<string>();
      for (const f of files) {
        patch(f.id, { state: "working", error: undefined });
        try {
          const res = await send(f.csv, false, []);
          if (res.kind === "roster") res.studentNumbers.forEach((n) => known.add(n));
          patch(f.id, { result: res, state: "ready" });
        } catch (err) {
          patch(f.id, { error: err instanceof Error ? err.message : "Could not read this file", result: undefined, state: "ready" });
        }
      }
      if (known.size > 0) {
        for (const f of files) {
          try {
            const first = await send(f.csv, false, []);
            if (first.kind === "gifts") patch(f.id, { result: await send(f.csv, false, [...known]) });
          } catch {
            /* the first pass already recorded this file's error */
          }
        }
      }
      setPreviewed(true);
    } finally {
      setBusy(false);
    }
  }

  async function importAll() {
    setBusy(true);
    let imported = 0;
    try {
      const order = [...files].sort((a, b) => (a.result?.kind === "gifts" ? 1 : 0) - (b.result?.kind === "gifts" ? 1 : 0));
      for (const f of order) {
        if (!f.result || f.result.summary.validRows === 0) continue;
        patch(f.id, { state: "working" });
        try {
          const res = await send(f.csv, true, []);
          patch(f.id, { result: res, state: "done" });
          imported += res.kind === "gifts" ? res.summary.giftsToCreate : res.summary.validRows;
        } catch (err) {
          patch(f.id, { error: err instanceof Error ? err.message : "Import failed", state: "ready" });
        }
      }
      toast.success(`Import finished — ${imported} rows saved`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const importable = files.some((f) => f.state !== "done" && f.result && f.result.summary.validRows > 0);

  return (
    <>
      <button onClick={() => setOpen(true)} className={ghostBtn}>
        <Upload className="h-4 w-4" aria-hidden /> Import CSV
      </button>
      {open && (
        <Modal title="Import students, charges and gifts" onClose={() => setOpen(false)}>
          <p className="text-xs text-slate-500">
            Pick <strong>one or several</strong> CSV files at once. A <strong>roster</strong> file has Student ID, First Name, Last Name (or Name), optional Email,
            Term and Charge. A <strong>gifts</strong> file has Student ID, Donor Name, Donor Email, Amount, Date, Type (Sponsor / Self-paid), Method and
            optionally Term and Reference. Rosters are imported before gifts, and re-uploading a file never duplicates anything.
          </p>
          <input
            type="file"
            accept=".csv,text/csv"
            multiple
            onChange={async (e) => {
              const picked = Array.from(e.target.files ?? []);
              const loaded = await Promise.all(picked.map(async (file, i) => ({ id: Date.now() + i, name: file.name, csv: await file.text(), state: "ready" as const })));
              setFiles(loaded);
              setPreviewed(false);
            }}
            className="block w-full text-sm"
          />
          <label className="block text-xs font-semibold text-slate-500">
            Term for rows with no Term column
            <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Fall 2026" className={`${input} mt-1`} />
          </label>
          {files.length > 0 && (
            <ul className="max-h-72 space-y-2 overflow-auto">
              {files.map((f) => (
                <li key={f.id} className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                  <p className="flex items-center justify-between gap-2 font-semibold">
                    <span className="truncate">{f.name}</span>
                    {f.state === "working" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                    {f.state === "done" && <span className="text-xs font-semibold text-emerald-700">Imported</span>}
                  </p>
                  {f.error && <p className="mt-1 text-xs text-red-700">{f.error}</p>}
                  {f.result && <p className="mt-1 text-xs">{fileSummary(f.result)}</p>}
                  {f.result && f.result.errors.length > 0 && (
                    <ul className="mt-2 max-h-24 list-disc overflow-auto pl-5 text-xs text-red-700">
                      {f.result.errors.map((er) => (
                        <li key={er.rowNumber}>
                          Row {er.rowNumber}
                          {er.studentNumber ? ` (${er.studentNumber})` : ""}: {er.errors.join("; ")}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setOpen(false)} className={ghostBtn}>Close</button>
            <button type="button" disabled={files.length === 0 || busy} onClick={previewAll} className={ghostBtn}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Preview {files.length > 1 ? "all" : ""}
            </button>
            <button type="button" disabled={!previewed || !importable || busy} onClick={importAll} className={primaryBtn}>
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

/**
 * Gets (or creates) the single giving link where donors search for any
 * student, and shows it with copy / open / edit-and-preview shortcuts.
 */
export function CollegeGivingLinkButton() {
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<{ url: string; id: string } | null>(null);
  async function load() {
    setBusy(true);
    try {
      const res = await call<{ link: { id: string; publicSlug: string } }>("/api/merchant/students/college-link", "POST", {});
      setLink({ url: `${window.location.origin}/g/${res.link.publicSlug}`, id: res.link.id });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }
  if (!link) {
    return (
      <button onClick={load} disabled={busy} className={ghostBtn}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />} Giving link for all students
      </button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2">
      <input readOnly value={link.url} className={`${input} w-64`} onFocus={(e) => e.currentTarget.select()} aria-label="Giving link for all students" />
      <button
        className={ghostBtn}
        onClick={async () => {
          await navigator.clipboard.writeText(link.url);
          toast.success("Link copied");
        }}
      >
        <Copy className="h-4 w-4" aria-hidden /> Copy
      </button>
      <a href={link.url} target="_blank" rel="noopener noreferrer" className={ghostBtn}>Open</a>
      <a href={`/merchant/giving-links/${link.id}/edit`} className={ghostBtn}>Edit &amp; preview</a>
    </div>
  );
}
