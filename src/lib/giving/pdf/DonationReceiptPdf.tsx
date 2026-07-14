import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: "Helvetica" },
  header: { marginBottom: 16, borderBottom: 1, borderBottomColor: "#e2e8f0", paddingBottom: 12, flexDirection: "row", justifyContent: "space-between" },
  logo: { width: 64, height: 64, objectFit: "contain", marginRight: 12 },
  orgName: { fontSize: 16, fontWeight: 700, marginBottom: 2 },
  title: { fontSize: 12, color: "#475569", marginTop: 4 },
  section: { marginBottom: 14 },
  sectionTitle: { fontSize: 11, fontWeight: 700, marginBottom: 6, color: "#0f172a" },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  label: { color: "#64748b" },
  value: { fontWeight: 700 },
  acknowledgment: { marginTop: 8, lineHeight: 1.4 },
  disclaimer: { fontSize: 8, color: "#64748b", marginTop: 16, lineHeight: 1.4 },
  footer: { position: "absolute", bottom: 24, left: 36, right: 36, fontSize: 8, color: "#94a3b8" },
});

function formatCents(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents || 0) / 100);
}

function formatDate(d: Date) {
  return new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export interface DonationReceiptPdfProps {
  organizationName: string;
  organizationLogoUrl: string | null;
  organizationAddress: string | null;
  organizationEmail: string | null;
  organizationPhone: string | null;
  organizationWebsite: string | null;
  organizationTaxId: string | null;
  donorName: string;
  donorEmail: string | null;
  donorAddress: string | null;
  receiptNumber: string;
  transactionReference: string;
  donationDate: Date;
  amountCents: number;
  fundName: string | null;
  designationText: string | null;
  paymentMethodLabel: string;
  isRecurring: boolean;
  recurringInterval: string | null;
  goodsServicesProvided: boolean;
  goodsServicesFairMarketValueCents: number | null;
  recordedContributionAmountCents: number | null;
  acknowledgmentText: string;
  disclaimer: string;
  footer: string | null;
}

export function DonationReceiptPdf(props: DonationReceiptPdfProps) {
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <View style={{ flexDirection: "row" }}>
            {props.organizationLogoUrl && <Image src={props.organizationLogoUrl} style={styles.logo} />}
            <View>
              <Text style={styles.orgName}>{props.organizationName}</Text>
              {props.organizationAddress && <Text style={{ color: "#64748b" }}>{props.organizationAddress}</Text>}
              <Text style={{ color: "#64748b" }}>
                {[props.organizationEmail, props.organizationPhone, props.organizationWebsite].filter(Boolean).join(" · ")}
              </Text>
              {props.organizationTaxId && <Text style={{ color: "#94a3b8", fontSize: 8 }}>Tax ID: {props.organizationTaxId}</Text>}
            </View>
          </View>
        </View>

        <Text style={styles.title}>Donation Receipt</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Donor</Text>
          <View style={styles.row}><Text style={styles.label}>Name</Text><Text style={styles.value}>{props.donorName}</Text></View>
          {props.donorEmail && <View style={styles.row}><Text style={styles.label}>Email</Text><Text style={styles.value}>{props.donorEmail}</Text></View>}
          {props.donorAddress && <View style={styles.row}><Text style={styles.label}>Address</Text><Text style={styles.value}>{props.donorAddress}</Text></View>}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Donation</Text>
          <View style={styles.row}><Text style={styles.label}>Receipt Number</Text><Text style={styles.value}>{props.receiptNumber}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Transaction Reference</Text><Text style={styles.value}>{props.transactionReference}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Date</Text><Text style={styles.value}>{formatDate(props.donationDate)}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Amount</Text><Text style={styles.value}>{formatCents(props.amountCents)}</Text></View>
          {props.fundName && <View style={styles.row}><Text style={styles.label}>Fund / Campaign</Text><Text style={styles.value}>{props.fundName}</Text></View>}
          {props.designationText && <View style={styles.row}><Text style={styles.label}>Gift Purpose</Text><Text style={styles.value}>{props.designationText}</Text></View>}
          <View style={styles.row}><Text style={styles.label}>Payment Method</Text><Text style={styles.value}>{props.paymentMethodLabel}</Text></View>
          <View style={styles.row}>
            <Text style={styles.label}>Frequency</Text>
            <Text style={styles.value}>{props.isRecurring ? `Recurring (${props.recurringInterval || "—"})` : "One-Time"}</Text>
          </View>
        </View>

        <Text style={styles.acknowledgment}>{props.acknowledgmentText}</Text>

        {props.goodsServicesProvided && (
          <View style={{ marginTop: 6 }}>
            <View style={styles.row}><Text style={styles.label}>Payment Amount</Text><Text style={styles.value}>{formatCents(props.amountCents)}</Text></View>
            <View style={styles.row}><Text style={styles.label}>Fair Market Value</Text><Text style={styles.value}>{formatCents(props.goodsServicesFairMarketValueCents ?? 0)}</Text></View>
            <View style={styles.row}><Text style={styles.label}>Recorded Contribution Amount</Text><Text style={styles.value}>{formatCents(props.recordedContributionAmountCents ?? props.amountCents)}</Text></View>
            <Text style={{ fontSize: 8, color: "#94a3b8", marginTop: 2 }}>
              This calculation is for acknowledgment and record-keeping purposes only. The organization is responsible for confirming the correct fair market value.
            </Text>
          </View>
        )}

        <Text style={styles.disclaimer}>{props.disclaimer}</Text>

        {props.footer && <Text style={{ fontSize: 9, color: "#64748b", marginTop: 8 }}>{props.footer}</Text>}

        <Text style={styles.footer} fixed>
          Generated {formatDate(new Date())}
        </Text>
      </Page>
    </Document>
  );
}
