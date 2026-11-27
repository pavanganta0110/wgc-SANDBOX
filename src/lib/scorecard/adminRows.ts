import type { CsvColumn } from "@/lib/csvExport";
import type { Contact } from "./types";

/** How far a person got with the $100 report, as the admin list shows it. */
export type LeadStatus = "NOT_PURCHASED" | "CHECKING" | "HELD" | "SENDING" | "SENT" | "FAILED";

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NOT_PURCHASED: "Scored only",
  CHECKING: "Checking payment",
  HELD: "Payment not confirmed",
  SENDING: "Sending report",
  SENT: "Report sent",
  FAILED: "Report failed",
};

const AREAS: Array<[string, string]> = [
  ["mission", "Mission & who you serve"],
  ["ask", "The ask"],
  ["platform", "Donor platform"],
  ["relationships", "Donor relationships"],
  ["board", "Board"],
  ["leaders", "Executive leadership"],
];

export interface AdminLeadRow {
  id: string;
  name: string;
  email: string;
  organization: string;
  role: string;
  phone: string;
  fundraisingScore: string;
  pitchScore: string;
  areaScores: Array<{ key: string; name: string; score: string; answer: string }>;
  pitch: string;
  status: LeadStatus;
  statusReason: string;
  transferId: string;
  reportSentAt: string | null;
  source: string;
  dataConsent: string;
  followUpsSent: string[];
  resultsEmailAt: string | null;
  unsubscribed: boolean;
  createdAt: string;
  lastScoredAt: string | null;
}

const iso = (ms?: number) => (ms ? new Date(ms).toISOString() : null);

export function statusOf(c: Contact): LeadStatus {
  switch (c.purchase?.status) {
    case "checking":
      return "CHECKING";
    case "pending":
      return "HELD";
    case "sending":
      return "SENDING";
    case "sent":
      return "SENT";
    case "failed":
      return "FAILED";
    default:
      return "NOT_PURCHASED";
  }
}

export function toAdminRow(c: Contact): AdminLeadRow {
  const scores = c.scores || {};
  const answers = c.answers || {};
  return {
    id: c.id,
    name: c.name || "",
    email: c.email,
    organization: c.org || "",
    role: c.role || "",
    phone: c.phone || "",
    fundraisingScore: c.fundraising_score === undefined || c.fundraising_score === null ? "" : String(c.fundraising_score),
    pitchScore: c.pitch_score === undefined || c.pitch_score === null ? "" : String(c.pitch_score),
    areaScores: AREAS.map(([key, name]) => ({ key, name, score: scores[key] === undefined || scores[key] === null ? "" : String(scores[key]), answer: String(answers[key] ?? "") })),
    pitch: c.pitch || "",
    status: statusOf(c),
    statusReason: c.purchase?.reason || "",
    transferId: c.purchase?.transfer_id || "",
    reportSentAt: iso(c.purchase?.sent_at),
    source: c.invited_as || "self",
    dataConsent: c.data_consent || "",
    followUpsSent: Object.keys(c.sent || {}).sort(),
    resultsEmailAt: iso(c.results_sent_at),
    unsubscribed: Boolean(c.unsubscribed_at),
    createdAt: iso(c.created_at) as string,
    lastScoredAt: iso(c.last_scored_at),
  };
}

/** Search (name, email, organization), a status filter, and newest or oldest first. */
export function filterLeads(rows: AdminLeadRow[], opts: { q?: string; status?: string; sort?: string }): AdminLeadRow[] {
  const q = (opts.q || "").trim().toLowerCase();
  const wanted = opts.status && opts.status !== "ALL" ? opts.status : null;
  const out = rows.filter((r) => {
    if (wanted && r.status !== wanted) return false;
    if (!q) return true;
    return [r.name, r.email, r.organization].some((v) => v.toLowerCase().includes(q));
  });
  out.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
  if (opts.sort !== "oldest") out.reverse();
  return out;
}

/** The export: one row per lead, with every area's score and answer so a sales call can start from it. */
export const LEAD_CSV_COLUMNS: CsvColumn<AdminLeadRow>[] = [
  { header: "Created", value: (r) => r.createdAt },
  { header: "Name", value: (r) => r.name },
  { header: "Email", value: (r) => r.email },
  { header: "Organization", value: (r) => r.organization },
  { header: "Role", value: (r) => r.role },
  { header: "Phone", value: (r) => r.phone },
  { header: "Fundraising score", value: (r) => r.fundraisingScore, numeric: true },
  { header: "Pitch score", value: (r) => r.pitchScore, numeric: true },
  ...AREAS.flatMap(([key, name]): CsvColumn<AdminLeadRow>[] => [
    { header: `${name} score`, value: (r) => r.areaScores.find((a) => a.key === key)?.score ?? "", numeric: true },
    { header: `${name} answer`, value: (r) => r.areaScores.find((a) => a.key === key)?.answer ?? "" },
  ]),
  { header: "Pitch", value: (r) => r.pitch },
  { header: "Report status", value: (r) => LEAD_STATUS_LABELS[r.status] },
  { header: "Status note", value: (r) => r.statusReason },
  { header: "Payment id", value: (r) => r.transferId },
  { header: "Report sent", value: (r) => r.reportSentAt ?? "" },
  { header: "Source", value: (r) => r.source },
  { header: "Data-use OK", value: (r) => r.dataConsent },
  { header: "Results email sent", value: (r) => r.resultsEmailAt ?? "" },
  { header: "Follow-ups sent", value: (r) => r.followUpsSent.join(" ") },
  { header: "Unsubscribed", value: (r) => (r.unsubscribed ? "yes" : "") },
];
