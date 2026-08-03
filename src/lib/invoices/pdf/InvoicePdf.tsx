import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: "Helvetica" },
  header: { marginBottom: 16, borderBottom: 1, borderBottomColor: "#e2e8f0", paddingBottom: 12, flexDirection: "row", justifyContent: "space-between" },
  logo: { width: 64, height: 64, objectFit: "contain", marginRight: 12 },
  orgName: { fontSize: 16, fontWeight: 700, marginBottom: 2 },
  title: { fontSize: 14, fontWeight: 700, marginTop: 4 },
  statusBadge: { fontSize: 9, color: "#0f172a", backgroundColor: "#e2e8f0", padding: "3 8", borderRadius: 4, alignSelf: "flex-start" },
  section: { marginBottom: 14 },
  sectionTitle: { fontSize: 11, fontWeight: 700, marginBottom: 6, color: "#0f172a" },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  label: { color: "#64748b" },
  value: { fontWeight: 700 },
  table: { marginTop: 8, borderTop: 1, borderTopColor: "#e2e8f0" },
  tableHeaderRow: { flexDirection: "row", paddingVertical: 6, borderBottom: 1, borderBottomColor: "#e2e8f0" },
  tableRow: { flexDirection: "row", paddingVertical: 6, borderBottom: 1, borderBottomColor: "#f1f5f9" },
  colDescription: { flex: 3 },
  colQty: { flex: 1, textAlign: "right" },
  colPrice: { flex: 1, textAlign: "right" },
  colTotal: { flex: 1, textAlign: "right" },
  totalsBlock: { marginTop: 10, alignSelf: "flex-end", width: 220 },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  grandTotalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4, paddingTop: 4, borderTop: 1, borderTopColor: "#0f172a" },
  qrBlock: { marginTop: 20, alignItems: "center" },
  qrImage: { width: 90, height: 90 },
  footer: { position: "absolute", bottom: 24, left: 36, right: 36, fontSize: 8, color: "#94a3b8" },
});

function formatCents(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents || 0) / 100);
}

function formatDate(d: Date) {
  return new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export interface InvoicePdfLineItem {
  description: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
}

export interface InvoicePdfProps {
  organizationName: string;
  organizationLogoUrl: string | null;
  organizationAddress: string | null;
  organizationEmail: string | null;
  organizationPhone: string | null;
  invoiceNumber: string;
  status: string;
  issueDate: Date;
  dueDate: Date;
  clientName: string;
  clientEmail: string | null;
  clientAddress: string | null;
  title: string | null;
  lineItems: InvoicePdfLineItem[];
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  serviceFeeCents: number;
  totalCents: number;
  amountPaidCents: number;
  balanceCents: number;
  clientMemo: string | null;
  paymentInstructions: string | null;
  termsAndConditions: string | null;
  footerMessage: string | null;
  /** Data-URI PNG of a QR code pointing at the invoice's public payment
   * page — omitted (no QR block rendered) when no fresh public token was
   * available at generation time, e.g. a merchant re-downloading a PDF for
   * an invoice whose raw token from the original send is no longer known
   * to the server (see generateInvoicePdf.ts's doc comment). */
  qrCodeDataUrl: string | null;
  payUrl: string | null;
}

export function InvoicePdf(props: InvoicePdfProps) {
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <View style={{ flexDirection: "row" }}>
            {props.organizationLogoUrl && <Image src={props.organizationLogoUrl} style={styles.logo} />}
            <View>
              <Text style={styles.orgName}>{props.organizationName}</Text>
              {props.organizationAddress && <Text style={{ color: "#64748b" }}>{props.organizationAddress}</Text>}
              <Text style={{ color: "#64748b" }}>{[props.organizationEmail, props.organizationPhone].filter(Boolean).join(" · ")}</Text>
            </View>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.title}>INVOICE</Text>
            <Text style={{ color: "#64748b", marginTop: 2 }}>{props.invoiceNumber}</Text>
            <Text style={styles.statusBadge}>{props.status.replace(/_/g, " ")}</Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 14 }}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Billed To</Text>
            <Text style={styles.value}>{props.clientName}</Text>
            {props.clientEmail && <Text style={{ color: "#64748b" }}>{props.clientEmail}</Text>}
            {props.clientAddress && <Text style={{ color: "#64748b" }}>{props.clientAddress}</Text>}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <View style={styles.row}><Text style={styles.label}>Issue Date  </Text><Text style={styles.value}>{formatDate(props.issueDate)}</Text></View>
            <View style={styles.row}><Text style={styles.label}>Due Date  </Text><Text style={styles.value}>{formatDate(props.dueDate)}</Text></View>
          </View>
        </View>

        {props.title && <Text style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>{props.title}</Text>}

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.colDescription, styles.label]}>Description</Text>
            <Text style={[styles.colQty, styles.label]}>Qty</Text>
            <Text style={[styles.colPrice, styles.label]}>Unit Price</Text>
            <Text style={[styles.colTotal, styles.label]}>Total</Text>
          </View>
          {props.lineItems.map((li, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={styles.colDescription}>{li.description}</Text>
              <Text style={styles.colQty}>{li.quantity}</Text>
              <Text style={styles.colPrice}>{formatCents(li.unitPriceCents)}</Text>
              <Text style={styles.colTotal}>{formatCents(li.totalCents)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsBlock}>
          <View style={styles.totalsRow}><Text style={styles.label}>Subtotal</Text><Text>{formatCents(props.subtotalCents)}</Text></View>
          {props.discountCents > 0 && <View style={styles.totalsRow}><Text style={styles.label}>Discount</Text><Text>-{formatCents(props.discountCents)}</Text></View>}
          {props.taxCents > 0 && <View style={styles.totalsRow}><Text style={styles.label}>Tax</Text><Text>{formatCents(props.taxCents)}</Text></View>}
          {props.serviceFeeCents > 0 && <View style={styles.totalsRow}><Text style={styles.label}>Service Fee</Text><Text>{formatCents(props.serviceFeeCents)}</Text></View>}
          <View style={styles.grandTotalRow}><Text style={{ fontWeight: 700 }}>Total</Text><Text style={{ fontWeight: 700 }}>{formatCents(props.totalCents)}</Text></View>
          {props.amountPaidCents > 0 && <View style={styles.totalsRow}><Text style={styles.label}>Paid</Text><Text>-{formatCents(props.amountPaidCents)}</Text></View>}
          <View style={styles.grandTotalRow}><Text style={{ fontWeight: 700 }}>Balance Due</Text><Text style={{ fontWeight: 700 }}>{formatCents(props.balanceCents)}</Text></View>
        </View>

        {props.clientMemo && <Text style={{ marginTop: 16 }}>{props.clientMemo}</Text>}
        {props.paymentInstructions && <Text style={{ marginTop: 8, color: "#64748b" }}>{props.paymentInstructions}</Text>}
        {props.termsAndConditions && <Text style={{ marginTop: 8, fontSize: 9, color: "#94a3b8" }}>{props.termsAndConditions}</Text>}

        {props.qrCodeDataUrl && props.payUrl && (
          <View style={styles.qrBlock}>
            <Image src={props.qrCodeDataUrl} style={styles.qrImage} />
            <Text style={{ fontSize: 9, color: "#64748b", marginTop: 4 }}>Scan to view and pay online</Text>
            <Text style={{ fontSize: 8, color: "#94a3b8" }}>{props.payUrl}</Text>
          </View>
        )}

        {props.footerMessage && <Text style={{ fontSize: 9, color: "#64748b", marginTop: 12 }}>{props.footerMessage}</Text>}

        <Text style={styles.footer} fixed>
          Generated {formatDate(new Date())}
        </Text>
      </Page>
    </Document>
  );
}
