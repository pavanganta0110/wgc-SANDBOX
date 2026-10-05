import { buildCsvExport, type CsvColumn } from "@/lib/csvExport";
import { formatResponse, type CustomFieldDefinition, type CustomFieldResponses } from "@/lib/eventRegistration/customFields";
import { utcToZonedLocal } from "@/lib/eventRegistration/timezone";

/**
 * The event export: one row per attendee (so a 4-person table is four
 * rows a merchant can sort, filter and mail-merge), with registration-level
 * facts repeated. Money columns appear only on the FIRST row of each
 * registration — repeating them would double-count the moment someone
 * sums a column in Excel. Built on the shared buildCsvExport, which
 * neutralizes spreadsheet formulas in every cell; the UTF-8 BOM makes
 * Excel open accented names correctly.
 */

export interface ExportRegistration {
  id: string;
  confirmationCode: string;
  status: string;
  registrantFirstName: string;
  registrantLastName: string;
  registrantEmail: string;
  registrantPhone: string | null;
  groupName: string | null;
  customResponsesJson: unknown;
  registrationAmountCents: number;
  addOnsAmountCents: number;
  donationAmountCents: number;
  totalCents: number;
  paymentId: string | null;
  createdAt: Date;
  paidAt: Date | null;
}

export interface ExportAttendee {
  registrationId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  customResponsesJson: unknown;
  checkedIn: boolean;
  checkedInAt: Date | null;
  createdAt: Date;
}

export interface ExportAddOnLine {
  registrationId: string;
  nameSnapshot: string;
  quantity: number;
}

interface Row {
  registration: ExportRegistration;
  attendee: ExportAttendee;
  isFirst: boolean;
  attendeeIndex: number;
}

export function formatPhoneForExport(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (national.length === 10) return `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
  return phone;
}

function dollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

function responseFor(fields: CustomFieldDefinition[], json: unknown, fieldId: string): string {
  const field = fields.find((f) => f.id === fieldId);
  if (!field || typeof json !== "object" || json === null) return "";
  const value = (json as CustomFieldResponses)[fieldId];
  return value === undefined ? "" : formatResponse(field, value);
}

export function buildEventCsv(params: {
  eventName: string;
  timezone: string;
  fields: CustomFieldDefinition[];
  registrations: ExportRegistration[];
  attendees: ExportAttendee[];
  addOnLines: ExportAddOnLine[];
  paymentStatusById: Map<string, string>;
}): string {
  const { eventName, timezone, fields, registrations, attendees, addOnLines, paymentStatusById } = params;
  const stamp = (d: Date | null) => (d ? utcToZonedLocal(d, timezone).replace("T", " ") : "");

  const attendeesByReg = new Map<string, ExportAttendee[]>();
  for (const a of attendees) {
    const list = attendeesByReg.get(a.registrationId) ?? [];
    list.push(a);
    attendeesByReg.set(a.registrationId, list);
  }
  const addOnsByReg = new Map<string, string[]>();
  for (const l of addOnLines) {
    const list = addOnsByReg.get(l.registrationId) ?? [];
    list.push(l.quantity > 1 ? `${l.nameSnapshot} x${l.quantity}` : l.nameSnapshot);
    addOnsByReg.set(l.registrationId, list);
  }

  const rows: Row[] = [];
  for (const registration of registrations) {
    const list = (attendeesByReg.get(registration.id) ?? []).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    list.forEach((attendee, i) => rows.push({ registration, attendee, isFirst: i === 0, attendeeIndex: i + 1 }));
  }

  const attendeeFields = fields.filter((f) => f.appliesTo === "ATTENDEE");
  const registrationFields = fields.filter((f) => f.appliesTo === "REGISTRATION");

  const columns: CsvColumn<Row>[] = [
    { header: "Event", value: () => eventName },
    { header: "Registration ID", value: (r) => r.registration.confirmationCode },
    { header: "Status", value: (r) => r.registration.status },
    { header: "Registrant First Name", value: (r) => r.registration.registrantFirstName },
    { header: "Registrant Last Name", value: (r) => r.registration.registrantLastName },
    { header: "Registrant Email", value: (r) => r.registration.registrantEmail },
    { header: "Registrant Phone", value: (r) => formatPhoneForExport(r.registration.registrantPhone) },
    { header: "Attendee #", value: (r) => String(r.attendeeIndex) },
    { header: "Attendee First Name", value: (r) => r.attendee.firstName },
    { header: "Attendee Last Name", value: (r) => r.attendee.lastName },
    { header: "Attendee Email", value: (r) => r.attendee.email ?? "" },
    { header: "Attendee Phone", value: (r) => formatPhoneForExport(r.attendee.phone) },
    { header: "Group", value: (r) => r.registration.groupName ?? "" },
    ...attendeeFields.map((f): CsvColumn<Row> => ({ header: f.label, value: (r) => responseFor(fields, r.attendee.customResponsesJson, f.id) })),
    ...registrationFields.map((f): CsvColumn<Row> => ({ header: f.label, value: (r) => (r.isFirst ? responseFor(fields, r.registration.customResponsesJson, f.id) : "") })),
    { header: "Add-ons", value: (r) => (r.isFirst ? (addOnsByReg.get(r.registration.id) ?? []).join("; ") : "") },
    { header: "Registration Amount", value: (r) => (r.isFirst ? dollars(r.registration.registrationAmountCents) : "") },
    { header: "Add-ons Amount", value: (r) => (r.isFirst ? dollars(r.registration.addOnsAmountCents) : "") },
    { header: "Donation Amount", value: (r) => (r.isFirst ? dollars(r.registration.donationAmountCents) : "") },
    { header: "Total Amount", value: (r) => (r.isFirst ? dollars(r.registration.totalCents) : "") },
    {
      header: "Payment Status",
      value: (r) => {
        if (!r.isFirst) return "";
        if (!r.registration.paymentId) return r.registration.totalCents > 0 ? "UNPAID" : "FREE";
        return (paymentStatusById.get(r.registration.paymentId) ?? "UNKNOWN").toUpperCase();
      },
    },
    { header: "Registered At", value: (r) => (r.isFirst ? stamp(r.registration.createdAt) : "") },
    { header: "Checked In", value: (r) => (r.attendee.checkedIn ? "Yes" : "No") },
    { header: "Checked In At", value: (r) => stamp(r.attendee.checkedInAt) },
  ];

  return "\uFEFF" + buildCsvExport(rows, columns).replace(/\n/g, "\r\n");
}
