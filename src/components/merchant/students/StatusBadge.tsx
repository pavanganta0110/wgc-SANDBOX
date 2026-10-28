import { STUDENT_STATUS_LABEL, type StudentCreditStatus } from "@/lib/students/constants";

const STYLES: Record<StudentCreditStatus, string> = {
  FULLY_CREDITED: "bg-emerald-50 text-emerald-700",
  PARTIAL: "bg-amber-50 text-amber-700",
  UNFUNDED: "bg-red-50 text-red-700",
  OVER_FUNDED: "bg-sky-50 text-sky-700",
  NO_CHARGE: "bg-slate-100 text-slate-600",
};

export default function StatusBadge({ status }: { status: StudentCreditStatus }) {
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STYLES[status]}`}>{STUDENT_STATUS_LABEL[status]}</span>;
}
