"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Plus, Trash2, Upload } from "lucide-react";
import { EVENT_TIMEZONES } from "@/lib/eventRegistration/timezone";
import EventPageView from "@/components/events/EventPageView";
import { DEFAULT_LIGHT_BRANDING } from "@/lib/givingLinks/types";
import { buildPreviewAddOns, buildPreviewEvent } from "@/lib/eventRegistration/previewData";
import type { CustomFieldDefinition } from "@/lib/eventRegistration/customFields";
import { inputClass, labelClass, primaryButton, secondaryButton, readApiError } from "@/components/events/merchant/api";

export interface EventFormValues {
  name: string;
  description: string;
  coverImageUrl: string;
  status: string;
  timezone: string;
  startsAtLocal: string;
  endsAtLocal: string;
  registrationOpensAtLocal: string;
  registrationClosesAtLocal: string;
  locationName: string;
  locationAddress: string;
  priceCents: number;
  priceMode: string;
  registrationFmvCents: number | null;
  allowOptionalDonation: boolean;
  donationPrompt: string;
  allowMultipleAttendees: boolean;
  maxAttendeesPerRegistration: number;
  attendeeEmailRequired: boolean;
  collectAttendeePhone: boolean;
  registrantPhoneRequired: boolean;
  allowGroups: boolean;
  groupLabel: string;
  groupRequired: boolean;
  mailingAddressMode: string;
  confirmationMessage: string;
  customFields: CustomFieldDefinition[];
}

export interface AddOnFormValue {
  id?: string;
  name: string;
  description: string;
  priceCents: number;
  fmvCents: number | null;
  maxQuantity: number;
  isActive: boolean;
}

export const EMPTY_EVENT: EventFormValues = {
  name: "",
  description: "",
  coverImageUrl: "",
  status: "DRAFT",
  timezone: "America/Chicago",
  startsAtLocal: "",
  endsAtLocal: "",
  registrationOpensAtLocal: "",
  registrationClosesAtLocal: "",
  locationName: "",
  locationAddress: "",
  priceCents: 0,
  priceMode: "PER_ATTENDEE",
  registrationFmvCents: null,
  allowOptionalDonation: false,
  donationPrompt: "",
  allowMultipleAttendees: true,
  maxAttendeesPerRegistration: 10,
  attendeeEmailRequired: false,
  collectAttendeePhone: false,
  registrantPhoneRequired: false,
  allowGroups: false,
  groupLabel: "Team / Group Name",
  groupRequired: false,
  mailingAddressMode: "HIDDEN",
  confirmationMessage: "",
  customFields: [],
};

const centsToDollars = (c: number | null) => (c == null ? "" : (c / 100).toFixed(2));
const dollarsToCents = (v: string): number | null => {
  const t = v.replace(/[^0-9.]/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <h3 className="text-sm font-bold text-slate-900">{title}</h3>
      {hint && <p className="text-xs text-slate-500 mt-0.5 mb-3">{hint}</p>}
      <div className={`space-y-4 ${hint ? "" : "mt-3"}`}>{children}</div>
    </section>
  );
}

function Check({ id, label, checked, onChange, hint }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <div>
      <label htmlFor={id} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
        <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        {label}
      </label>
      {hint && <p className="text-xs text-slate-500 ml-6">{hint}</p>}
    </div>
  );
}

export default function EventSettingsForm({
  eventId,
  initialValues = EMPTY_EVENT,
  initialAddOns = [],
  onSaved,
  organization,
}: {
  /** Omit to create a new event. */
  eventId?: string;
  initialValues?: EventFormValues;
  initialAddOns?: AddOnFormValue[];
  /** Called after a successful edit so the parent can refetch. */
  onSaved?: () => void;
  /** Shown in the live preview exactly as registrants will see it. */
  organization: { name: string; logoUrl: string | null };
}) {
  const router = useRouter();
  const [v, setV] = useState<EventFormValues>(initialValues);
  const [addOns, setAddOns] = useState<AddOnFormValue[]>(initialAddOns);
  const [price, setPrice] = useState(centsToDollars(initialValues.priceCents));
  const [fmv, setFmv] = useState(centsToDollars(initialValues.registrationFmvCents));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function uploadCover(file: File) {
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/merchant/events/image-upload", { method: "POST", body });
      if (!res.ok) return void toast.error(await readApiError(res, "Couldn't upload that image."));
      const data = await res.json();
      set("coverImageUrl", data.imageUrl);
      toast.success("Image uploaded — save the event to publish it");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const set = <K extends keyof EventFormValues>(key: K, value: EventFormValues[K]) => setV((p) => ({ ...p, [key]: value }));

  function updateField(i: number, patch: Partial<CustomFieldDefinition>) {
    set("customFields", v.customFields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }
  function updateAddOn(i: number, patch: Partial<AddOnFormValue>) {
    setAddOns((p) => p.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  }

  const previewEvent = useMemo(() => buildPreviewEvent(v, dollarsToCents(price) ?? 0), [v, price]);
  const previewAddOns = useMemo(() => buildPreviewAddOns(addOns), [addOns]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload = {
        ...v,
        priceCents: dollarsToCents(price) ?? 0,
        registrationFmvCents: dollarsToCents(fmv),
        addOns,
      };
      const res = await fetch(eventId ? `/api/merchant/events/${eventId}` : "/api/merchant/events", {
        method: eventId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const message = await readApiError(res, "We couldn't save this event.");
        setError(message);
        toast.error(message);
        return;
      }
      toast.success(eventId ? "Event saved" : "Event created");
      if (eventId) {
        onSaved?.();
        router.refresh();
      } else {
        const data = await res.json();
        router.push(`/merchant/events/${data.event.id}`);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(380px,470px)] lg:gap-8 lg:items-start">
    <form onSubmit={save} className="space-y-5 min-w-0" noValidate>
      <Section title="Basics">
        <div>
          <label htmlFor="ev-name" className={labelClass}>Event name *</label>
          <input id="ev-name" className={inputClass} value={v.name} onChange={(e) => set("name", e.target.value)} maxLength={120} />
        </div>
        <div>
          <label htmlFor="ev-desc" className={labelClass}>Description</label>
          <textarea id="ev-desc" rows={4} className={inputClass} value={v.description} onChange={(e) => set("description", e.target.value)} maxLength={5000} />
        </div>
        <div>
          <label htmlFor="ev-cover" className={labelClass}>Cover image (optional)</label>
          {v.coverImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={v.coverImageUrl} alt="Current cover" className="mb-2 max-h-40 rounded-lg border border-slate-200 object-cover" />
          )}
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              id="ev-cover-file"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadCover(file);
              }}
            />
            <label htmlFor="ev-cover-file" className={`${secondaryButton} cursor-pointer`}>
              <Upload className="w-4 h-4 mr-1.5" aria-hidden="true" /> {uploading ? "Uploading…" : v.coverImageUrl ? "Replace image" : "Upload image"}
            </label>
            {v.coverImageUrl && (
              <button type="button" onClick={() => set("coverImageUrl", "")} className="text-xs text-red-600">Remove</button>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">PNG, JPG or WEBP up to 5 MB, or paste an https:// image address below. Your organization&apos;s logo and name are shown automatically at the top of the page.</p>
          <input id="ev-cover" aria-label="Cover image address" className={`${inputClass} mt-2`} placeholder="https://…" value={v.coverImageUrl} onChange={(e) => set("coverImageUrl", e.target.value)} />
        </div>
        <div>
          <label htmlFor="ev-status" className={labelClass}>Status</label>
          <select id="ev-status" className={inputClass} value={v.status} onChange={(e) => set("status", e.target.value)}>
            <option value="DRAFT">Draft — not public</option>
            <option value="ACTIVE">Active — accepting registrations</option>
            <option value="INACTIVE">Inactive — registration paused</option>
          </select>
        </div>
      </Section>

      <Section title="When & where">
        <div>
          <label htmlFor="ev-tz" className={labelClass}>Time zone</label>
          <select id="ev-tz" className={inputClass} value={v.timezone} onChange={(e) => set("timezone", e.target.value)}>
            {EVENT_TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="ev-start" className={labelClass}>Starts *</label>
            <input id="ev-start" type="datetime-local" className={inputClass} value={v.startsAtLocal} onChange={(e) => set("startsAtLocal", e.target.value)} />
          </div>
          <div>
            <label htmlFor="ev-end" className={labelClass}>Ends (optional)</label>
            <input id="ev-end" type="datetime-local" className={inputClass} value={v.endsAtLocal} onChange={(e) => set("endsAtLocal", e.target.value)} />
          </div>
          <div>
            <label htmlFor="ev-loc" className={labelClass}>Location name</label>
            <input id="ev-loc" className={inputClass} value={v.locationName} onChange={(e) => set("locationName", e.target.value)} maxLength={200} />
          </div>
          <div>
            <label htmlFor="ev-addr" className={labelClass}>Location address</label>
            <input id="ev-addr" className={inputClass} value={v.locationAddress} onChange={(e) => set("locationAddress", e.target.value)} maxLength={300} />
          </div>
          <div>
            <label htmlFor="ev-opens" className={labelClass}>Registration opens (optional)</label>
            <input id="ev-opens" type="datetime-local" className={inputClass} value={v.registrationOpensAtLocal} onChange={(e) => set("registrationOpensAtLocal", e.target.value)} />
          </div>
          <div>
            <label htmlFor="ev-closes" className={labelClass}>Registration closes (optional)</label>
            <input id="ev-closes" type="datetime-local" className={inputClass} value={v.registrationClosesAtLocal} onChange={(e) => set("registrationClosesAtLocal", e.target.value)} />
          </div>
        </div>
      </Section>

      <Section title="Pricing" hint="Leave the price at $0 for a free RSVP — no payment step is shown and nothing is charged.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="ev-price" className={labelClass}>Registration price</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500" aria-hidden="true">$</span>
              <input id="ev-price" inputMode="decimal" className={`${inputClass} pl-7`} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
            </div>
          </div>
          <div>
            <label htmlFor="ev-mode" className={labelClass}>Price applies</label>
            <select id="ev-mode" className={inputClass} value={v.priceMode} onChange={(e) => set("priceMode", e.target.value)}>
              <option value="PER_ATTENDEE">Per attendee</option>
              <option value="PER_REGISTRATION">Once per registration</option>
            </select>
          </div>
          <div>
            <label htmlFor="ev-fmv" className={labelClass}>Value of what registrants receive (optional)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500" aria-hidden="true">$</span>
              <input id="ev-fmv" inputMode="decimal" className={`${inputClass} pl-7`} value={fmv} onChange={(e) => setFmv(e.target.value)} placeholder="Same as price" />
            </div>
            <p className="text-xs text-slate-500 mt-1">Used on tax receipts: only the amount above this value is recorded as a charitable contribution. Leave blank if registrants receive the full value (e.g. a meal).</p>
          </div>
        </div>
        <Check id="ev-donation" label="Offer an optional additional donation" checked={v.allowOptionalDonation} onChange={(x) => set("allowOptionalDonation", x)} />
        {v.allowOptionalDonation && (
          <div>
            <label htmlFor="ev-donprompt" className={labelClass}>Donation prompt</label>
            <input id="ev-donprompt" className={inputClass} value={v.donationPrompt} placeholder="Would you like to make an additional gift?" onChange={(e) => set("donationPrompt", e.target.value)} maxLength={200} />
          </div>
        )}
      </Section>

      <Section title="Add-ons" hint="Optional paid extras registrants can add — e.g. a sponsorship, a raffle ticket, extra meals.">
        {addOns.map((a, i) => (
          <div key={a.id ?? `new-${i}`} className="rounded-xl border border-slate-200 p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="sm:col-span-2">
                <label htmlFor={`ao-name-${i}`} className={labelClass}>Name *</label>
                <input id={`ao-name-${i}`} className={inputClass} value={a.name} onChange={(e) => updateAddOn(i, { name: e.target.value })} maxLength={120} />
              </div>
              <div>
                <label htmlFor={`ao-price-${i}`} className={labelClass}>Price *</label>
                <input id={`ao-price-${i}`} inputMode="decimal" className={inputClass} defaultValue={centsToDollars(a.priceCents)} onBlur={(e) => updateAddOn(i, { priceCents: dollarsToCents(e.target.value) ?? 0 })} placeholder="0.00" />
              </div>
              <div>
                <label htmlFor={`ao-max-${i}`} className={labelClass}>Max per registration</label>
                <input id={`ao-max-${i}`} type="number" min={1} max={100} className={inputClass} value={a.maxQuantity} onChange={(e) => updateAddOn(i, { maxQuantity: Number(e.target.value) })} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="sm:col-span-3">
                <label htmlFor={`ao-desc-${i}`} className={labelClass}>Description</label>
                <input id={`ao-desc-${i}`} className={inputClass} value={a.description} onChange={(e) => updateAddOn(i, { description: e.target.value })} maxLength={500} />
              </div>
              <div>
                <label htmlFor={`ao-fmv-${i}`} className={labelClass}>Value received</label>
                <input id={`ao-fmv-${i}`} inputMode="decimal" className={inputClass} defaultValue={centsToDollars(a.fmvCents)} onBlur={(e) => updateAddOn(i, { fmvCents: dollarsToCents(e.target.value) })} placeholder="Same as price" />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Check id={`ao-active-${i}`} label="Available" checked={a.isActive} onChange={(x) => updateAddOn(i, { isActive: x })} />
              <button type="button" onClick={() => setAddOns((p) => p.filter((_, idx) => idx !== i))} className="text-xs text-red-600 inline-flex items-center gap-1">
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> Remove
              </button>
            </div>
          </div>
        ))}
        <button type="button" onClick={() => setAddOns((p) => [...p, { name: "", description: "", priceCents: 0, fmvCents: null, maxQuantity: 1, isActive: true }])} className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600">
          <Plus className="w-4 h-4" aria-hidden="true" /> Add an add-on
        </button>
      </Section>

      <Section title="Attendees">
        <Check id="ev-multi" label="Allow registering more than one attendee" checked={v.allowMultipleAttendees} onChange={(x) => set("allowMultipleAttendees", x)} />
        {v.allowMultipleAttendees && (
          <div className="max-w-xs">
            <label htmlFor="ev-maxatt" className={labelClass}>Maximum attendees per registration</label>
            <input id="ev-maxatt" type="number" min={1} max={50} className={inputClass} value={v.maxAttendeesPerRegistration} onChange={(e) => set("maxAttendeesPerRegistration", Number(e.target.value))} />
          </div>
        )}
        <Check id="ev-attemail" label="Require an email for every attendee" checked={v.attendeeEmailRequired} onChange={(x) => set("attendeeEmailRequired", x)} hint="Otherwise attendee emails are optional — but only attendees with an email can receive event emails." />
        <Check id="ev-attphone" label="Ask for each attendee's phone number" checked={v.collectAttendeePhone} onChange={(x) => set("collectAttendeePhone", x)} />
        <Check id="ev-regphone" label="Require the registrant's phone number" checked={v.registrantPhoneRequired} onChange={(x) => set("registrantPhoneRequired", x)} />
        <div className="max-w-xs">
          <label htmlFor="ev-mail" className={labelClass}>Registrant mailing address</label>
          <select id="ev-mail" className={inputClass} value={v.mailingAddressMode} onChange={(e) => set("mailingAddressMode", e.target.value)}>
            <option value="HIDDEN">Don&apos;t ask</option>
            <option value="OPTIONAL">Optional</option>
            <option value="REQUIRED">Required</option>
          </select>
        </div>
      </Section>

      <Section title="Group / team" hint="Let registrants enter a team, table, company, class or any grouping you name.">
        <Check id="ev-groups" label="Ask for a group name" checked={v.allowGroups} onChange={(x) => set("allowGroups", x)} />
        {v.allowGroups && (
          <>
            <div className="max-w-sm">
              <label htmlFor="ev-glabel" className={labelClass}>Field label</label>
              <input id="ev-glabel" className={inputClass} value={v.groupLabel} onChange={(e) => set("groupLabel", e.target.value)} maxLength={60} />
            </div>
            <Check id="ev-grequired" label="Required" checked={v.groupRequired} onChange={(x) => set("groupRequired", x)} />
          </>
        )}
      </Section>

      <Section title="Custom questions" hint="Ask each registration, or each attendee, anything else you need — shirt size, meal choice, a waiver checkbox.">
        {v.customFields.map((f, i) => (
          <div key={f.id || `f-${i}`} className="rounded-xl border border-slate-200 p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-1">
                <label htmlFor={`cf-label-${i}`} className={labelClass}>Question *</label>
                <input id={`cf-label-${i}`} className={inputClass} value={f.label} onChange={(e) => updateField(i, { label: e.target.value })} maxLength={80} />
              </div>
              <div>
                <label htmlFor={`cf-type-${i}`} className={labelClass}>Answer type</label>
                <select id={`cf-type-${i}`} className={inputClass} value={f.type} onChange={(e) => updateField(i, { type: e.target.value as CustomFieldDefinition["type"] })}>
                  <option value="TEXT">Short text</option>
                  <option value="TEXTAREA">Long text</option>
                  <option value="DROPDOWN">Dropdown</option>
                  <option value="CHECKBOX">Checkbox</option>
                  <option value="NUMBER">Number</option>
                </select>
              </div>
              <div>
                <label htmlFor={`cf-scope-${i}`} className={labelClass}>Asked</label>
                <select id={`cf-scope-${i}`} className={inputClass} value={f.appliesTo} onChange={(e) => updateField(i, { appliesTo: e.target.value as CustomFieldDefinition["appliesTo"] })}>
                  <option value="ATTENDEE">For each attendee</option>
                  <option value="REGISTRATION">Once per registration</option>
                </select>
              </div>
            </div>
            {f.type === "DROPDOWN" && (
              <div>
                <label htmlFor={`cf-opts-${i}`} className={labelClass}>Options (one per line)</label>
                <textarea
                  id={`cf-opts-${i}`}
                  rows={3}
                  className={inputClass}
                  defaultValue={(f.options ?? []).join("\n")}
                  onBlur={(e) => updateField(i, { options: e.target.value.split("\n").map((o) => o.trim()).filter(Boolean) })}
                />
              </div>
            )}
            <div className="flex items-center justify-between">
              <Check id={`cf-req-${i}`} label="Required" checked={f.required} onChange={(x) => updateField(i, { required: x })} />
              <button type="button" onClick={() => set("customFields", v.customFields.filter((_, idx) => idx !== i))} className="text-xs text-red-600 inline-flex items-center gap-1">
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> Remove
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => set("customFields", [...v.customFields, { id: "", label: "", type: "TEXT", required: false, appliesTo: "ATTENDEE" }])}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600"
        >
          <Plus className="w-4 h-4" aria-hidden="true" /> Add a question
        </button>
      </Section>

      <Section title="After registration">
        <div>
          <label htmlFor="ev-confirm" className={labelClass}>Confirmation message</label>
          <textarea id="ev-confirm" rows={3} className={inputClass} value={v.confirmationMessage} onChange={(e) => set("confirmationMessage", e.target.value)} maxLength={3000} placeholder="Shown on the confirmation screen after registering." />
          <p className="text-xs text-slate-500 mt-1">The confirmation, reminder and thank-you emails are edited in the Emails tab.</p>
        </div>
      </Section>

      {error && (
        <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <button type="submit" disabled={saving} className={primaryButton}>
          {saving ? "Saving…" : eventId ? "Save changes" : "Create event"}
        </button>
      </div>
    </form>

    <aside aria-label="Live preview" className="mt-8 lg:mt-0 lg:sticky lg:top-4">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-sm font-bold text-slate-900">Live preview</h3>
        <p className="text-xs text-slate-500">What registrants will see — updates as you type</p>
      </div>
      <div className="rounded-2xl border border-slate-200 overflow-hidden shadow-sm lg:max-h-[calc(100vh-6rem)] overflow-y-auto bg-white">
        <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 border-b border-slate-200" aria-hidden="true">
          <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
          <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
          <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
          <span className="ml-2 text-[11px] text-slate-500 truncate">{organization.name} · Event Registration</span>
        </div>
        <EventPageView
          preview
          event={previewEvent}
          addOns={previewAddOns}
          organization={{ name: organization.name, logoUrl: organization.logoUrl, finixMerchantId: null }}
          checkout={null}
          light={DEFAULT_LIGHT_BRANDING}
          closedMessage={null}
          showPoweredByWgc
        />
      </div>
      <p className="text-xs text-slate-500 mt-2">Try it out — nothing here is submitted, saved or charged.</p>
    </aside>
    </div>
  );
}
