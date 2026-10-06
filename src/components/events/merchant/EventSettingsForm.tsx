"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Plus, Trash2, Upload, Film, Eye } from "lucide-react";
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
  confirmationImageUrl: string;
  confirmationVideoUrl: string;
  hostName: string;
  headerText: string;
  paymentMethods: string[];
  allowRecurringDonation: boolean;
  /** An existing giving page for the monthly gift; "" = the event makes its own. */
  donationGivingLinkId: string;
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
  confirmationImageUrl: "",
  confirmationVideoUrl: "",
  hostName: "",
  headerText: "",
  paymentMethods: ["CARD", "BANK", "APPLE_PAY", "GOOGLE_PAY"],
  allowRecurringDonation: false,
  donationGivingLinkId: "",
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
  const thanksImageRef = useRef<HTMLInputElement>(null);
  const thanksVideoRef = useRef<HTMLInputElement>(null);
  const [uploadingMedia, setUploadingMedia] = useState<"image" | "video" | null>(null);
  const [videoProgress, setVideoProgress] = useState<number | null>(null);
  const [showThankYou, setShowThankYou] = useState(false);
  const [giftLinks, setGiftLinks] = useState<{ id: string; publicSlug: string; name: string }[] | null>(null);

  const wantsMonthlyGift = v.allowOptionalDonation && v.allowRecurringDonation;
  useEffect(() => {
    if (!wantsMonthlyGift || giftLinks) return;
    let cancelled = false;
    fetch("/api/merchant/events/monthly-gift-links", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { links: [] }))
      .then((d) => !cancelled && setGiftLinks(d.links ?? []))
      .catch(() => !cancelled && setGiftLinks([]));
    return () => {
      cancelled = true;
    };
  }, [wantsMonthlyGift, giftLinks]);

  async function uploadThankYouImage(file: File) {
    setUploadingMedia("image");
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/merchant/events/image-upload", { method: "POST", body });
      if (!res.ok) return void toast.error(await readApiError(res, "Couldn't upload that photo."));
      set("confirmationImageUrl", (await res.json()).imageUrl);
      toast.success("Photo added");
    } finally {
      setUploadingMedia(null);
      if (thanksImageRef.current) thanksImageRef.current.value = "";
    }
  }

  /** Videos are far bigger than a server request can carry, so the browser sends them straight to storage using a one-time upload link. */
  async function uploadThankYouVideo(file: File) {
    setUploadingMedia("video");
    setVideoProgress(0);
    try {
      const sign = await fetch("/api/merchant/events/video-upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, contentType: file.type, size: file.size }),
      });
      if (!sign.ok) return void toast.error(await readApiError(sign, "Couldn't prepare that upload."));
      const { uploadUrl, publicUrl } = await sign.json();
      await new Promise<void>((resolve, reject) => {
        const form = new FormData();
        form.append("cacheControl", "3600");
        form.append("", file);
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl);
        xhr.upload.onprogress = (e) => e.lengthComputable && setVideoProgress(Math.round((e.loaded / e.total) * 100));
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status}).`)));
        xhr.onerror = () => reject(new Error("The upload was interrupted."));
        xhr.send(form);
      });
      set("confirmationVideoUrl", publicUrl);
      toast.success("Video uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? `${err.message} You can also paste a YouTube or Vimeo link.` : "Couldn't upload that video. You can also paste a YouTube or Vimeo link.");
    } finally {
      setUploadingMedia(null);
      setVideoProgress(null);
      if (thanksVideoRef.current) thanksVideoRef.current.value = "";
    }
  }

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

  /** Saves the event. `status` lets the Publish / Unpublish buttons save and change visibility in one step. */
  async function submit(status?: string) {
    setError(null);
    setSaving(true);
    try {
      const payload = {
        ...v,
        ...(status ? { status } : {}),
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
      const finalStatus = status ?? v.status;
      if (status) set("status", status);
      toast.success(eventId ? (finalStatus === "ACTIVE" && v.status !== "ACTIVE" ? "Event published" : "Event saved") : finalStatus === "ACTIVE" ? "Event created and published" : "Event created as a draft");
      if (eventId) {
        onSaved?.();
        router.refresh();
      } else {
        const data = await res.json();
        router.push(`/merchant/events/${data.event.id}?created=${finalStatus === "ACTIVE" ? "published" : "draft"}`);
      }
    } finally {
      setSaving(false);
    }
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    void submit();
  }

  const isLive = v.status === "ACTIVE";
  const hostDisplayName = v.hostName.trim() || organization.name;

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

      <Section title="Page header" hint="What appears at the top of your event page, above the event name.">
        <div>
          <label htmlFor="ev-host" className={labelClass}>Organization name shown</label>
          <input id="ev-host" className={inputClass} value={v.hostName} placeholder={organization.name} onChange={(e) => set("hostName", e.target.value)} maxLength={120} />
          <p className="text-xs text-slate-500 mt-1">Leave blank to use {organization.name}. Your logo is added automatically when you have one.</p>
        </div>
        <div>
          <label htmlFor="ev-header" className={labelClass}>Header line (optional)</label>
          <input id="ev-header" className={inputClass} value={v.headerText} placeholder="e.g. Join us for an evening to support our students" onChange={(e) => set("headerText", e.target.value)} maxLength={200} />
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
        {v.allowOptionalDonation && (
          <Check
            id="ev-recurring"
            label="Let people make that gift monthly"
            checked={v.allowRecurringDonation}
            onChange={(x) => set("allowRecurringDonation", x)}
            hint="They register and pay today's total as usual, then finish setting up the monthly gift on a secure recurring-giving page. The monthly part is never mixed into the registration charge."
          />
        )}
        {wantsMonthlyGift && (
          <div>
            <label htmlFor="ev-gift-link" className={labelClass}>Connect the monthly gift to a giving page</label>
            <select id="ev-gift-link" className={inputClass} value={v.donationGivingLinkId} onChange={(e) => set("donationGivingLinkId", e.target.value)}>
              <option value="">Create a page for this event automatically</option>
              {(giftLinks ?? []).map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
              {v.donationGivingLinkId && giftLinks && !giftLinks.some((l) => l.id === v.donationGivingLinkId) && <option value={v.donationGivingLinkId}>Current page</option>}
            </select>
            <p className="text-xs text-slate-500 mt-1">
              Pick one of your existing giving pages and monthly gifts go there — with that page&apos;s fund, receipts and branding. Only active pages that allow monthly giving are listed. Choosing a page doesn&apos;t change it.
            </p>
          </div>
        )}
      </Section>

      <Section title="Ways to pay" hint="Which payment options the checkout offers. Apple Pay and Google Pay only appear when your organization has them turned on. Free events don't show any payment options.">
        <div className="grid grid-cols-2 gap-3">
          {[
            ["CARD", "Credit / debit card"],
            ["BANK", "Bank account (ACH)"],
            ["APPLE_PAY", "Apple Pay"],
            ["GOOGLE_PAY", "Google Pay"],
          ].map(([key, label]) => (
            <Check
              key={key}
              id={`ev-pay-${key}`}
              label={label}
              checked={v.paymentMethods.includes(key)}
              onChange={(on) => set("paymentMethods", on ? [...v.paymentMethods, key] : v.paymentMethods.filter((m) => m !== key))}
            />
          ))}
        </div>
        {v.paymentMethods.length === 0 && <p className="text-xs text-red-600">Choose at least one way to pay.</p>}
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

      <Section title="Thank-you screen" hint="Shown right after someone registers. Add a photo or a video if you like.">
        <div>
          <label htmlFor="ev-confirm" className={labelClass}>Message</label>
          <textarea id="ev-confirm" rows={3} className={inputClass} value={v.confirmationMessage} onChange={(e) => set("confirmationMessage", e.target.value)} maxLength={3000} placeholder="Thank you for registering! We can't wait to see you." />
        </div>

        <div>
          <p className={labelClass}>Photo (optional)</p>
          {v.confirmationImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={v.confirmationImageUrl} alt="Thank-you photo" className="mb-2 max-h-40 rounded-lg border border-slate-200 object-cover" />
          )}
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={thanksImageRef}
              id="ev-thanks-image"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadThankYouImage(f);
              }}
            />
            <label htmlFor="ev-thanks-image" className={`${secondaryButton} cursor-pointer`}>
              <Upload className="w-4 h-4 mr-1.5" aria-hidden="true" /> {uploadingMedia === "image" ? "Uploading…" : v.confirmationImageUrl ? "Replace photo" : "Upload photo"}
            </label>
            {v.confirmationImageUrl && (
              <button type="button" onClick={() => set("confirmationImageUrl", "")} className="text-xs text-red-600">Remove</button>
            )}
          </div>
        </div>

        <div>
          <p className={labelClass}>Video (optional)</p>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <input
              ref={thanksVideoRef}
              id="ev-thanks-video-file"
              type="file"
              accept="video/mp4,video/webm"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadThankYouVideo(f);
              }}
            />
            <label htmlFor="ev-thanks-video-file" className={`${secondaryButton} cursor-pointer`}>
              <Film className="w-4 h-4 mr-1.5" aria-hidden="true" />
              {uploadingMedia === "video" ? `Uploading… ${videoProgress ?? 0}%` : v.confirmationVideoUrl ? "Replace video" : "Upload video"}
            </label>
            {v.confirmationVideoUrl && (
              <button type="button" onClick={() => set("confirmationVideoUrl", "")} className="text-xs text-red-600">Remove</button>
            )}
          </div>
          <label htmlFor="ev-thanks-video" className="sr-only">Video link</label>
          <input id="ev-thanks-video" className={inputClass} placeholder="…or paste a YouTube, Vimeo, TikTok or video link" value={v.confirmationVideoUrl} onChange={(e) => set("confirmationVideoUrl", e.target.value)} />
          <p className="text-xs text-slate-500 mt-1">Upload an MP4 or WebM up to 150 MB, or paste a link. The confirmation, reminder and thank-you emails are edited in the Emails tab.</p>
        </div>
      </Section>

      {error && (
        <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-3 sticky bottom-0 bg-slate-50/90 backdrop-blur py-3 -mx-1 px-1">
        {eventId && isLive && (
          <button type="button" disabled={saving} onClick={() => void submit("INACTIVE")} className={secondaryButton}>
            Unpublish
          </button>
        )}
        <button type="submit" disabled={saving || v.paymentMethods.length === 0} className={isLive ? primaryButton : secondaryButton}>
          {saving ? "Saving…" : eventId ? (isLive ? "Save changes" : "Save draft") : "Create as draft"}
        </button>
        {!isLive && (
          <button type="button" disabled={saving || v.paymentMethods.length === 0} onClick={() => void submit("ACTIVE")} className={primaryButton}>
            {eventId ? "Publish event" : "Create & publish"}
          </button>
        )}
      </div>
    </form>

    <aside aria-label="Live preview" className="mt-8 lg:mt-0 lg:sticky lg:top-4">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-sm font-bold text-slate-900">Live preview</h3>
        <p className="text-xs text-slate-500">What registrants will see — updates as you type</p>
      </div>
      <div className="mb-2" role="group" aria-label="Preview screen">
        <button type="button" aria-pressed={showThankYou} onClick={() => setShowThankYou((x) => !x)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600">
          <Eye className="w-3.5 h-3.5" aria-hidden="true" /> {showThankYou ? "Back to the registration form" : "Preview the thank-you screen"}
        </button>
      </div>
      <div className="rounded-2xl border border-slate-200 overflow-hidden shadow-sm lg:max-h-[calc(100vh-6rem)] overflow-y-auto bg-white">
        <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 border-b border-slate-200" aria-hidden="true">
          <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
          <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
          <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
          <span className="ml-2 text-[11px] text-slate-500 truncate">{hostDisplayName} · Event Registration</span>
        </div>
        <EventPageView
          preview
          event={previewEvent}
          addOns={previewAddOns}
          organization={{ name: hostDisplayName, logoUrl: organization.logoUrl, finixMerchantId: null }}
          checkout={null}
          light={DEFAULT_LIGHT_BRANDING}
          closedMessage={null}
          showPoweredByWgc
          previewConfirmation={showThankYou}
          monthlyGiftSlug={v.allowOptionalDonation && v.allowRecurringDonation ? "preview" : null}
        />
      </div>
      <p className="text-xs text-slate-500 mt-2">Try it out — nothing here is submitted, saved or charged.</p>
    </aside>
    </div>
  );
}
