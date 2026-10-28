"use client";

import { useEffect, useState } from "react";
import type { BrandingModeSettings } from "@/lib/givingLinks/types";
import type { PublicStudentGiving } from "@/lib/givingLinks/loadPublicGivingPageData";

export type StudentChoice = {
  givenFor: "" | "SPONSOR" | "SELF" | "GENERAL";
  studentId: string;
  studentName: string;
};

export const EMPTY_STUDENT_CHOICE: StudentChoice = { givenFor: "", studentId: "", studentName: "" };

/** True while the picker still needs an answer before a gift can be submitted. */
export function studentChoiceIncomplete(studentGiving: PublicStudentGiving | null | undefined, choice: StudentChoice): boolean {
  if (studentGiving?.mode !== "PICKER") return false;
  if (!choice.givenFor) return true;
  return choice.givenFor !== "GENERAL" && !choice.studentId;
}

/** The two fields sent to /donate; the server re-validates both. */
export function studentChoicePayload(studentGiving: PublicStudentGiving | null | undefined, choice: StudentChoice) {
  if (studentGiving?.mode === "LOCKED") {
    return { studentGivenFor: choice.givenFor === "SELF" ? "SELF" : "SPONSOR" };
  }
  if (studentGiving?.mode !== "PICKER" || !choice.givenFor) return {};
  return { studentGivenFor: choice.givenFor, studentId: choice.studentId || undefined };
}

export default function StudentGiftPicker({
  slug,
  studentGiving,
  choice,
  onChange,
  light,
  previewStudents,
}: {
  /** Builder preview only: searches this list locally instead of calling the public endpoint. */
  previewStudents?: { id: string; name: string }[];
  slug: string;
  studentGiving: PublicStudentGiving;
  choice: StudentChoice;
  onChange: (next: StudentChoice) => void;
  light: Pick<BrandingModeSettings, "bodyTextColor" | "borderColor">;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; name: string }[]>([]);
  const [searching, setSearching] = useState(false);

  const needsStudent = choice.givenFor === "SPONSOR" || choice.givenFor === "SELF";
  const searching_ = needsStudent && !choice.studentId;

  // Results are only shown for a 2+ character query (see the render below), so a
  // stale list from an earlier query is never displayed and needs no clearing here.
  useEffect(() => {
    if (previewStudents || !searching_ || query.trim().length < 2) return;
    const handle = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/g/${slug}/students?q=${encodeURIComponent(query.trim())}`);
        const data = await res.json().catch(() => ({ students: [] }));
        setResults(Array.isArray(data.students) ? data.students : []);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query, slug, searching_, previewStudents]);

  const shown = previewStudents
    ? previewStudents.filter((st) => query.trim().split(/\s+/).every((t) => st.name.toLowerCase().includes(t.toLowerCase()))).slice(0, 15)
    : results;

  const labelStyle = { color: light.bodyTextColor };
  const inputClass = "w-full px-3 py-2 rounded-lg border text-sm outline-none";
  const inputStyle = { borderColor: light.borderColor };

  if (studentGiving.mode === "LOCKED") {
    return (
      <div className="rounded-lg border p-3" style={inputStyle}>
        <p className="text-sm font-semibold" style={labelStyle}>
          Giving toward {studentGiving.studentName}
          {studentGiving.termLabel ? ` — ${studentGiving.termLabel}` : ""}
        </p>
        <label className="mt-2 flex items-center gap-2 text-xs" style={labelStyle}>
          <input
            type="checkbox"
            checked={choice.givenFor === "SELF"}
            onChange={(e) => onChange({ ...EMPTY_STUDENT_CHOICE, givenFor: e.target.checked ? "SELF" : "SPONSOR" })}
          />
          I am this student, paying my own bill
        </label>
      </div>
    );
  }

  return (
    <div>
      <label className="block text-xs font-semibold mb-2" style={labelStyle}>
        Who is this gift for?
        {studentGiving.termLabel ? ` (${studentGiving.termLabel})` : ""}
      </label>
      <select
        value={choice.givenFor}
        onChange={(e) => {
          setQuery("");
          onChange({ givenFor: e.target.value as StudentChoice["givenFor"], studentId: "", studentName: "" });
        }}
        className={inputClass}
        style={inputStyle}
      >
        <option value="">Select...</option>
        <option value="SPONSOR">A student I&apos;m supporting</option>
        <option value="SELF">Myself — I&apos;m the student</option>
        <option value="GENERAL">General scholarship fund</option>
      </select>

      {needsStudent && choice.studentId && (
        <p className="mt-2 text-sm" style={labelStyle}>
          {choice.givenFor === "SELF" ? "Student: " : "Giving to: "}
          <strong>{choice.studentName}</strong>{" "}
          <button type="button" className="underline text-xs" onClick={() => onChange({ ...choice, studentId: "", studentName: "" })}>
            Change
          </button>
        </p>
      )}

      {searching_ && (
        <div className="mt-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={choice.givenFor === "SELF" ? "Search for your name" : "Search for the student's name"}
            className={inputClass}
            style={inputStyle}
            autoComplete="off"
          />
          {query.trim().length >= 2 && (
            <ul className="mt-1 rounded-lg border divide-y max-h-48 overflow-auto" style={inputStyle}>
              {shown.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-black/5"
                    style={labelStyle}
                    onClick={() => onChange({ ...choice, studentId: s.id, studentName: s.name })}
                  >
                    {s.name}
                  </button>
                </li>
              ))}
              {!searching && shown.length === 0 && (
                <li className="px-3 py-2 text-xs" style={labelStyle}>No matching students found.</li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
