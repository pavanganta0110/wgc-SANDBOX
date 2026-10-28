import { Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";
import { STUDENT_STATUS_LABEL } from "./constants";
import type { StudentLedgerRow } from "./ledger";

// Never cut a word mid-line (names, IDs); wrapping only happens at spaces.
Font.registerHyphenationCallback((word) => [word]);

const usd = (cents: number | null) =>
  cents == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

const COLS = [
  { key: "name", label: "Student", w: 150, align: "left" as const },
  { key: "num", label: "ID", w: 62, align: "left" as const },
  { key: "charge", label: "Charge", w: 66, align: "right" as const },
  { key: "credited", label: "Credited", w: 66, align: "right" as const },
  { key: "sponsor", label: "Sponsors", w: 66, align: "right" as const },
  { key: "self", label: "Self-paid", w: 62, align: "right" as const },
  { key: "pending", label: "Pending", w: 58, align: "right" as const },
  { key: "balance", label: "Balance", w: 66, align: "right" as const },
  { key: "status", label: "Status", w: 90, align: "left" as const },
];

const s = StyleSheet.create({
  page: { padding: 28, fontSize: 8.5, fontFamily: "Helvetica", color: "#0f172a" },
  org: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  title: { fontSize: 11, marginTop: 4 },
  meta: { fontSize: 8.5, color: "#475569", marginTop: 2 },
  summary: { flexDirection: "row", gap: 18, marginTop: 10, marginBottom: 10 },
  summaryItem: { flexDirection: "column" },
  summaryLabel: { fontSize: 7.5, color: "#64748b" },
  summaryValue: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  headRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#cbd5e1", paddingBottom: 3, backgroundColor: "#f1f5f9", paddingTop: 3 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0", paddingVertical: 3 },
  cell: { paddingHorizontal: 3 },
  footer: { position: "absolute", bottom: 14, left: 28, right: 28, fontSize: 7.5, color: "#94a3b8", flexDirection: "row", justifyContent: "space-between" },
});

export interface StudentLedgerPdfProps {
  organizationName: string;
  termLabel: string;
  filterLabel: string;
  rows: StudentLedgerRow[];
  generatedAt: string;
}

function cellText(r: StudentLedgerRow, key: string): string {
  switch (key) {
    case "name": return r.name;
    case "num": return r.studentNumber;
    case "charge": return usd(r.chargeCents);
    case "credited": return usd(r.creditedCents);
    case "sponsor": return r.sponsorCents ? usd(r.sponsorCents) : "—";
    case "self": return r.selfCents ? usd(r.selfCents) : "—";
    case "pending": return r.pendingCents ? usd(r.pendingCents) : "—";
    case "balance": return usd(r.balanceCents);
    default: return STUDENT_STATUS_LABEL[r.status];
  }
}

export default function StudentLedgerPdf({ organizationName, termLabel, filterLabel, rows, generatedAt }: StudentLedgerPdfProps) {
  const charged = rows.reduce((t, r) => t + (r.chargeCents ?? 0), 0);
  const credited = rows.reduce((t, r) => t + r.creditedCents, 0);
  const sponsor = rows.reduce((t, r) => t + r.sponsorCents, 0);
  const self = rows.reduce((t, r) => t + r.selfCents, 0);
  const summary = [
    ["Students", String(rows.length)],
    ["Charged", usd(charged)],
    ["Credited", usd(credited)],
    ["From sponsors", usd(sponsor)],
    ["Self-paid", usd(self)],
  ];
  return (
    <Document title={`Student ledger — ${termLabel}`}>
      <Page size="LETTER" orientation="landscape" style={s.page}>
        <Text style={s.org}>{organizationName}</Text>
        <Text style={s.title}>Student giving — {termLabel}</Text>
        <Text style={s.meta}>Showing: {filterLabel} · Generated {generatedAt}</Text>
        <View style={s.summary}>
          {summary.map(([label, value]) => (
            <View key={label} style={s.summaryItem}>
              <Text style={s.summaryLabel}>{label}</Text>
              <Text style={s.summaryValue}>{value}</Text>
            </View>
          ))}
        </View>
        <View style={s.headRow} fixed>
          {COLS.map((c) => (
            <Text key={c.key} style={[s.cell, { width: c.w, textAlign: c.align, fontFamily: "Helvetica-Bold" }]}>{c.label}</Text>
          ))}
        </View>
        {rows.map((r) => (
          <View key={r.studentId} style={s.row} wrap={false}>
            {COLS.map((c) => (
              <Text key={c.key} style={[s.cell, { width: c.w, textAlign: c.align }]}>{cellText(r, c.key)}</Text>
            ))}
          </View>
        ))}
        {rows.length === 0 && <Text style={{ marginTop: 12, color: "#64748b" }}>No students match this filter.</Text>}
        <View style={s.footer} fixed>
          <Text>Credited counts settled gifts only, net of refunds. Pending gifts are shown separately.</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
