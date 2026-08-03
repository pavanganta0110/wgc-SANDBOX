/**
 * Plain (non-"use client") invoice form types/defaults — split out of
 * InvoiceBuilderForm.tsx because a Server Component (the /invoices/new
 * page) needs to call emptyInvoiceForm() to build its initial state.
 * Calling an exported function from a "use client" module directly in a
 * Server Component is a Next.js RSC boundary violation — it silently
 * works in dev but throws in a production build ("Attempted to call
 * emptyInvoiceForm() from the server but emptyInvoiceForm is on the
 * client"). Keeping this logic in a plain module makes it safe to import
 * from both the server page and the client form component.
 */

export interface ClientRef {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  organizationName: string | null;
  clientType: string;
}

export interface LineItemForm {
  description: string;
  detailedDescription: string;
  quantity: number;
  unitPriceCents: number;
  discountType: "FIXED" | "PERCENTAGE";
  discountValue: number;
  taxRateBasisPoints: number | null;
  productCode: string;
}

export const EMPTY_LINE_ITEM: LineItemForm = {
  description: "",
  detailedDescription: "",
  quantity: 1,
  unitPriceCents: 0,
  discountType: "FIXED",
  discountValue: 0,
  taxRateBasisPoints: null,
  productCode: "",
};

export interface InvoiceFormValues {
  id?: string;
  invoiceNumber?: string;
  client: ClientRef | null;
  title: string;
  poReference: string;
  issueDate: string;
  dueDate: string;
  internalNotes: string;
  clientMemo: string;
  paymentInstructions: string;
  termsAndConditions: string;
  lineItems: LineItemForm[];
  discountCents: number;
  serviceFeeCents: number;
  allowCard: boolean;
  allowAch: boolean;
  allowApplePay: boolean;
  allowGooglePay: boolean;
  allowPartialPayments: boolean;
  minimumPartialPaymentCents: number | null;
  feeCoveredBy: "MERCHANT" | "CLIENT";
  autoCloseWhenPaid: boolean;
  templateName: string;
  accentColor: string;
  classification: "GOODS_OR_SERVICES" | "CHARITABLE_DONATION" | "PARTIAL_DONATION";
  goodsServicesValueCents: number | null;
  charitablePortionCents: number | null;
  noGoodsOrServicesConfirmed: boolean;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function defaultDueDateIso() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

export function emptyInvoiceForm(): InvoiceFormValues {
  return {
    client: null,
    title: "",
    poReference: "",
    issueDate: todayIso(),
    dueDate: defaultDueDateIso(),
    internalNotes: "",
    clientMemo: "",
    paymentInstructions: "",
    termsAndConditions: "",
    lineItems: [{ ...EMPTY_LINE_ITEM }],
    discountCents: 0,
    serviceFeeCents: 0,
    allowCard: true,
    allowAch: true,
    allowApplePay: true,
    allowGooglePay: true,
    allowPartialPayments: false,
    minimumPartialPaymentCents: null,
    feeCoveredBy: "MERCHANT",
    autoCloseWhenPaid: true,
    templateName: "CLASSIC",
    accentColor: "",
    classification: "GOODS_OR_SERVICES",
    goodsServicesValueCents: null,
    charitablePortionCents: null,
    noGoodsOrServicesConfirmed: false,
  };
}
