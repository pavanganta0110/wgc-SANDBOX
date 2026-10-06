"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { CheckCircle, Plus, Trash2, Loader2 } from "lucide-react";
import GivingLinkForm from "@/components/giving/GivingLinkForm";
import { formatCents } from "@/lib/format";
import { resolveThankYouVideoEmbed } from "@/lib/givingLinks/types";
import { computeRegistrationTotals } from "@/lib/eventRegistration/pricing";
import type { PublicEventData } from "@/lib/eventRegistration/loadPublicEvent";
import type { CustomFieldDefinition, CustomFieldResponses } from "@/lib/eventRegistration/customFields";

/**
 * Public registration form for /event/[slug]. Free registrations are posted
 * straight to /api/event/[slug]/register. Anything with a charge renders the
 * ordinary GivingLinkForm in `eventMode`: that form collects the registrant
 * and card/bank details, calls `beforeCharge` (which posts the cart to the
 * register API and returns the PENDING registration's id), then charges
 * through the normal /api/g/[slug]/donate route. The total shown here is a
 * convenience only — the server recomputes it from the event's own prices.
 */

type Props = Pick<PublicEventData, "event" | "addOns" | "organization" | "checkout" | "light"> & {
  /** Merchant-side preview (event editor): fully interactive so add-ons, attendees and questions can be tried, but nothing is submitted, charged or saved. */
  previewMode?: boolean;
  /** Editor preview only: show the thank-you screen instead of the form. */
  previewConfirmation?: boolean;
  /** The event's monthly-gift page, when it offers a recurring additional donation. */
  monthlyGiftSlug?: string | null;
};

interface AttendeeDraft {
  key: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  responses: CustomFieldResponses;
}

interface Registrant {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address?: Record<string, string | undefined>;
}

interface Confirmation {
  code: string;
  paid: boolean;
  pendingBank: boolean;
  email: string;
  /** A monthly gift the registrant asked for — set up on the gift page after registering. */
  monthlyCents: number;
}

const inputClass = "w-full px-3 py-2 rounded-lg border text-sm outline-none bg-white";

function dollarsToCents(value: string): number {
  const n = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function newClientKey(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  }
}

function FieldInput({
  field,
  value,
  onChange,
  idPrefix,
  borderColor,
}: {
  field: CustomFieldDefinition;
  value: string | number | boolean | undefined;
  onChange: (v: string | number | boolean) => void;
  idPrefix: string;
  borderColor: string;
}) {
  const id = `${idPrefix}-${field.id}`;
  if (field.type === "CHECKBOX") {
    return (
      <label htmlFor={id} className="flex items-start gap-2 text-sm cursor-pointer">
        <input id={id} type="checkbox" className="mt-0.5" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
        <span>
          {field.label}
          {field.required && <span aria-hidden="true"> *</span>}
        </span>
      </label>
    );
  }
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold mb-1">
        {field.label}
        {field.required && <span aria-hidden="true"> *</span>}
      </label>
      {field.type === "DROPDOWN" ? (
        <select id={id} className={inputClass} style={{ borderColor }} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select…</option>
          {field.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : field.type === "TEXTAREA" ? (
        <textarea id={id} rows={3} className={inputClass} style={{ borderColor }} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} maxLength={2000} />
      ) : (
        <input
          id={id}
          type={field.type === "NUMBER" ? "number" : "text"}
          inputMode={field.type === "NUMBER" ? "decimal" : undefined}
          className={inputClass}
          style={{ borderColor }}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          maxLength={500}
        />
      )}
    </div>
  );
}

export default function EventRegistrationForm({ event, addOns, organization, checkout, light, previewMode = false, previewConfirmation = false, monthlyGiftSlug = null }: Props) {
  const [clientKey] = useState(newClientKey);
  const nextKey = useRef(1);

  const [selfAttending, setSelfAttending] = useState(true);
  const [selfResponses, setSelfResponses] = useState<CustomFieldResponses>({});
  const [others, setOthers] = useState<AttendeeDraft[]>([]);
  const [groupName, setGroupName] = useState("");
  const [regResponses, setRegResponses] = useState<CustomFieldResponses>({});
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [donation, setDonation] = useState("");
  const [monthly, setMonthly] = useState(false);

  // Free-path registrant (the paid path collects these inside GivingLinkForm).
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState({ addressLine1: "", city: "", state: "", postalCode: "" });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const pendingCode = useRef<{ code: string; email: string } | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  // Bumped on every reported problem so a repeat of the same message still scrolls into view.
  const [errorTick, setErrorTick] = useState(0);
  const reportError = (message: string) => {
    setError(message);
    setErrorTick((t) => t + 1);
  };

  // Tell the website this was embedded on / opened from (if any) that a
  // registration finished. Deliberately only the slug and whether the bank
  // payment is still processing — no names, codes or payment details ever
  // reach a host page (the origin is "*" because the host is unknown; the
  // receiving loader verifies event.origin before trusting anything).
  useEffect(() => {
    if (!confirmation || previewMode) return;
    const message = { source: "wgc-event", type: "WGC_EVENT_REGISTERED", slug: event.slug, pending: confirmation.pendingBank };
    try {
      if (window.opener && window.opener !== window) window.opener.postMessage(message, "*");
      if (window.parent && window.parent !== window) window.parent.postMessage(message, "*");
    } catch {
      // A cross-origin opener can refuse; the registration itself already succeeded.
    }
  }, [confirmation, previewMode, event.slug]);

  // The Pay button sits far below the cart, so a problem found on submit
  // (a missing required answer) has to be brought into view.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [error, errorTick]);

  const attendeeFields = event.customFields.filter((f) => f.appliesTo === "ATTENDEE");
  const registrationFields = event.customFields.filter((f) => f.appliesTo === "REGISTRATION");
  const maxAttendees = event.allowMultipleAttendees ? event.maxAttendeesPerRegistration : 1;
  const attendeeCount = (selfAttending ? 1 : 0) + others.length;

  const donationEntered = event.allowOptionalDonation ? dollarsToCents(donation) : 0;
  const canGoMonthly = event.allowRecurringDonation && Boolean(monthlyGiftSlug);
  // A monthly gift is set up separately afterwards, so it is NOT part of this
  // registration's charge — only a one-time donation is.
  const monthlyCents = canGoMonthly && monthly ? donationEntered : 0;
  const donationCents = monthlyCents > 0 ? 0 : donationEntered;
  const selections = Object.entries(quantities)
    .filter(([, q]) => q > 0)
    .map(([addOnId, quantity]) => ({ addOnId, quantity }));

  const selectionsKey = JSON.stringify(selections);
  const pricing = useMemo(
    () =>
      computeRegistrationTotals({
        event: { priceCents: event.priceCents, priceMode: event.priceMode, registrationFmvCents: null, allowOptionalDonation: event.allowOptionalDonation },
        attendeeCount: Math.max(attendeeCount, 1),
        addOns: addOns.map((a) => ({ id: a.id, name: a.name, priceCents: a.priceCents, fmvCents: null, maxQuantity: a.maxQuantity, isActive: true })),
        selections,
        donationCents,
      }),
    // `selections` is rebuilt every render; its serialized form is the stable dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [event.priceCents, event.priceMode, event.allowOptionalDonation, attendeeCount, addOns, selectionsKey, donationCents]
  );
  const totalCents = pricing.ok ? pricing.totals.totalCents : 0;
  const needsPayment = totalCents > 0;
  const borderColor = light.borderColor;

  function addAttendee() {
    if (attendeeCount >= maxAttendees) return;
    setOthers((prev) => [...prev, { key: nextKey.current++, firstName: "", lastName: "", email: "", phone: "", responses: {} }]);
  }
  function updateOther(key: number, patch: Partial<AttendeeDraft>) {
    setOthers((prev) => prev.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  }

  /** Local checks that need no server round trip; the server re-validates everything. */
  function validateLocal(): string | null {
    if (attendeeCount < 1) return "Add at least one attendee.";
    if (event.allowGroups && event.groupRequired && !groupName.trim()) return `${event.groupLabel} is required.`;
    for (const f of registrationFields) {
      const v = regResponses[f.id];
      if (f.required && (f.type === "CHECKBOX" ? v !== true : v === undefined || String(v).trim() === "")) return `"${f.label}" is required.`;
    }
    const scopes: { label: string; responses: CustomFieldResponses }[] = [
      ...(selfAttending ? [{ label: "You", responses: selfResponses }] : []),
      ...others.map((a, i) => ({ label: `Attendee ${i + (selfAttending ? 2 : 1)}`, responses: a.responses })),
    ];
    for (const s of scopes) {
      for (const f of attendeeFields) {
        const v = s.responses[f.id];
        if (f.required && (f.type === "CHECKBOX" ? v !== true : v === undefined || String(v).trim() === "")) return `${s.label}: "${f.label}" is required.`;
      }
    }
    for (const [i, a] of others.entries()) {
      if (!a.firstName.trim() || !a.lastName.trim()) return `Attendee ${i + (selfAttending ? 2 : 1)}: first and last name are required.`;
      if (event.attendeeEmailRequired && !a.email.trim()) return `Attendee ${i + (selfAttending ? 2 : 1)}: an email address is required.`;
    }
    if (!pricing.ok) return pricing.error;
    return null;
  }

  async function postRegistration(registrant: Registrant) {
    const attendees = [
      ...(selfAttending
        ? [{ firstName: registrant.firstName, lastName: registrant.lastName, email: registrant.email, phone: registrant.phone, customResponses: selfResponses }]
        : []),
      ...others.map((a) => ({ firstName: a.firstName, lastName: a.lastName, email: a.email, phone: a.phone, customResponses: a.responses })),
    ];
    const res = await fetch(`/api/event/${encodeURIComponent(event.slug)}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientKey,
        registrant,
        attendees,
        groupName: event.allowGroups ? groupName : undefined,
        customResponses: regResponses,
        addOns: selections,
        donationCents,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data.error || "We couldn't complete your registration. Please try again.");
    return data as { registrationId: string; confirmationCode: string; status: "CONFIRMED" | "PENDING"; requiresPayment: boolean };
  }

  async function submitFree(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const problem = validateLocal();
    if (problem) return reportError(problem);
    if (!first.trim() || !last.trim()) return reportError("Please enter your first and last name.");
    if (!email.trim()) return reportError("Please enter your email address.");
    if (event.registrantPhoneRequired && !phone.trim()) return reportError("A phone number is required for this event.");
    setSubmitting(true);
    try {
      const data = await postRegistration({
        firstName: first.trim(),
        lastName: last.trim(),
        email: email.trim(),
        phone: phone.trim(),
        address: event.mailingAddressMode !== "HIDDEN" ? address : undefined,
      });
      setConfirmation({ code: data.confirmationCode, paid: false, pendingBank: false, email: email.trim(), monthlyCents });
    } catch (err) {
      reportError(err instanceof Error ? err.message : "We couldn't complete your registration. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function beforeCharge(registrant: Omit<Registrant, "address"> & { mailingAddress: Record<string, string | undefined> | undefined }) {
    setError(null);
    const problem = validateLocal();
    if (problem) {
      reportError(problem);
      toast.error(problem);
      return null;
    }
    try {
      const data = await postRegistration({ ...registrant, address: registrant.mailingAddress });
      pendingCode.current = { code: data.confirmationCode, email: registrant.email };
      return { registrationId: data.registrationId };
    } catch (err) {
      const message = err instanceof Error ? err.message : "We couldn't start your registration. Please try again.";
      reportError(message);
      toast.error(message);
      return null;
    }
  }

  const shownConfirmation: Confirmation | null =
    confirmation ?? (previewMode && previewConfirmation ? { code: "SAMPLE12", paid: false, pendingBank: false, email: "you@example.com", monthlyCents: canGoMonthly && monthly ? monthlyCents : 0 } : null);

  if (shownConfirmation) {
    const video = event.confirmationVideoUrl ? resolveThankYouVideoEmbed(event.confirmationVideoUrl) : null;
    return (
      <div className="text-center py-4" role="status">
        <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-600" aria-hidden="true" />
        <h2 className="text-xl font-bold mb-2" style={{ color: light.headingColor }}>
          {shownConfirmation.pendingBank ? "Registration received" : "You're registered!"}
        </h2>
        <p className="text-sm mb-4 whitespace-pre-line" style={{ color: light.bodyTextColor }}>
          {event.confirmationMessage?.trim() || "Thank you for registering. We look forward to seeing you."}
        </p>
        {event.confirmationImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.confirmationImageUrl} alt="" className="w-full max-h-80 object-cover rounded-xl mb-4" />
        )}
        {video && (
          <div className="mb-4 rounded-xl overflow-hidden bg-black" style={{ aspectRatio: video.aspect.replace("/", " / ") }}>
            {video.kind === "video" ? (
              <video src={video.src} controls playsInline preload="metadata" className="w-full h-full" />
            ) : (
              <iframe
                src={video.src.replace(/autoplay=1/, "autoplay=0")}
                title="Thank-you video"
                className="w-full h-full border-0"
                allow="encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
              />
            )}
          </div>
        )}
        {shownConfirmation.pendingBank && (
          <p className="text-sm mb-4" style={{ color: light.bodyTextColor }}>
            Your bank payment is processing. We&apos;ll confirm by email once it clears.
          </p>
        )}
        <div className="inline-block rounded-xl border px-5 py-3" style={{ borderColor }}>
          <p className="text-xs uppercase tracking-wider" style={{ color: light.bodyTextColor }}>
            Confirmation code
          </p>
          <p className="text-2xl font-bold tracking-widest" style={{ color: light.headingColor }}>
            {shownConfirmation.code}
          </p>
        </div>
        <p className="text-xs mt-4" style={{ color: light.bodyTextColor }}>
          A confirmation email is on its way to {shownConfirmation.email}.
        </p>
        {shownConfirmation.monthlyCents > 0 && monthlyGiftSlug && (
          <div className="mt-6 rounded-xl border p-4 text-left" style={{ borderColor }}>
            <p className="font-semibold text-sm mb-1" style={{ color: light.headingColor }}>
              One more step for your monthly gift
            </p>
            <p className="text-sm mb-3" style={{ color: light.bodyTextColor }}>
              Your registration is complete. Finish setting up your {formatCents(shownConfirmation.monthlyCents)}/month gift to {organization.name} — it takes a minute and is a separate, secure payment.
            </p>
            <a
              href={previewMode ? undefined : `/g/${encodeURIComponent(monthlyGiftSlug)}?give=monthly&amount=${shownConfirmation.monthlyCents}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center py-2.5 rounded-lg font-semibold text-sm"
              style={{ backgroundColor: light.buttonBackground, color: light.buttonText }}
            >
              Set up my {formatCents(shownConfirmation.monthlyCents)}/month gift
            </a>
          </div>
        )}
      </div>
    );
  }

  const sectionTitle = "text-sm font-bold mb-3";
  const labelClass = "block text-xs font-semibold mb-1";

  const registrantSection = (
  <section aria-labelledby="registrant-heading" className="space-y-3">
    <h2 id="registrant-heading" className={sectionTitle} style={{ color: light.headingColor }}>
      Your information
    </h2>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <label htmlFor="reg-first" className={labelClass}>
          First name *
        </label>
        <input id="reg-first" autoComplete="given-name" className={inputClass} style={{ borderColor }} value={first} onChange={(e) => setFirst(e.target.value)} maxLength={80} />
      </div>
      <div>
        <label htmlFor="reg-last" className={labelClass}>
          Last name *
        </label>
        <input id="reg-last" autoComplete="family-name" className={inputClass} style={{ borderColor }} value={last} onChange={(e) => setLast(e.target.value)} maxLength={80} />
      </div>
    </div>
    <div>
      <label htmlFor="reg-email" className={labelClass}>
        Email *
      </label>
      <input id="reg-email" type="email" autoComplete="email" className={inputClass} style={{ borderColor }} value={email} onChange={(e) => setEmail(e.target.value)} />
    </div>
    <div>
      <label htmlFor="reg-phone" className={labelClass}>
        Phone{event.registrantPhoneRequired ? " *" : " (optional)"}
      </label>
      <input id="reg-phone" type="tel" autoComplete="tel" className={inputClass} style={{ borderColor }} value={phone} onChange={(e) => setPhone(e.target.value)} />
    </div>
    {event.mailingAddressMode !== "HIDDEN" && (
      <fieldset className="space-y-3">
        <legend className={labelClass}>Mailing address{event.mailingAddressMode === "REQUIRED" ? " *" : " (optional)"}</legend>
        <input aria-label="Street address" autoComplete="address-line1" placeholder="Street address" className={inputClass} style={{ borderColor }} value={address.addressLine1} onChange={(e) => setAddress((p) => ({ ...p, addressLine1: e.target.value }))} />
        <div className="grid grid-cols-6 gap-3">
          <input aria-label="City" autoComplete="address-level2" placeholder="City" className={`${inputClass} col-span-3`} style={{ borderColor }} value={address.city} onChange={(e) => setAddress((p) => ({ ...p, city: e.target.value }))} />
          <input aria-label="State" autoComplete="address-level1" placeholder="State" className={`${inputClass} col-span-1`} style={{ borderColor }} value={address.state} onChange={(e) => setAddress((p) => ({ ...p, state: e.target.value }))} maxLength={2} />
          <input aria-label="ZIP code" autoComplete="postal-code" placeholder="ZIP" className={`${inputClass} col-span-2`} style={{ borderColor }} value={address.postalCode} onChange={(e) => setAddress((p) => ({ ...p, postalCode: e.target.value }))} />
        </div>
      </fieldset>
    )}
  </section>
  );


  return (
    <form onSubmit={previewMode || needsPayment ? (e) => e.preventDefault() : submitFree} className="space-y-8" style={{ color: light.bodyTextColor }} noValidate>
      {/* Attendees */}
      <section aria-labelledby="attendees-heading">
        <h2 id="attendees-heading" className={sectionTitle} style={{ color: light.headingColor }}>
          Who&apos;s attending?
        </h2>
        <label className="flex items-center gap-2 text-sm mb-3 cursor-pointer">
          <input type="checkbox" checked={selfAttending} onChange={(e) => setSelfAttending(e.target.checked)} />
          I (the person registering) will attend
        </label>

        {selfAttending && attendeeFields.length > 0 && (
          <div className="rounded-xl border p-4 mb-3 space-y-3" style={{ borderColor }}>
            <p className="text-xs font-semibold uppercase tracking-wider">You</p>
            {attendeeFields.map((f) => (
              <FieldInput key={f.id} field={f} idPrefix="self" value={selfResponses[f.id]} borderColor={borderColor} onChange={(v) => setSelfResponses((p) => ({ ...p, [f.id]: v }))} />
            ))}
          </div>
        )}

        {others.map((a, i) => {
          const n = i + (selfAttending ? 2 : 1);
          return (
            <div key={a.key} className="rounded-xl border p-4 mb-3 space-y-3" style={{ borderColor }}>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider">Attendee {n}</p>
                <button type="button" onClick={() => setOthers((p) => p.filter((x) => x.key !== a.key))} className="text-xs text-red-600 inline-flex items-center gap-1" aria-label={`Remove attendee ${n}`}>
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> Remove
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor={`a${a.key}-first`} className={labelClass}>
                    First name *
                  </label>
                  <input id={`a${a.key}-first`} className={inputClass} style={{ borderColor }} value={a.firstName} onChange={(e) => updateOther(a.key, { firstName: e.target.value })} maxLength={80} />
                </div>
                <div>
                  <label htmlFor={`a${a.key}-last`} className={labelClass}>
                    Last name *
                  </label>
                  <input id={`a${a.key}-last`} className={inputClass} style={{ borderColor }} value={a.lastName} onChange={(e) => updateOther(a.key, { lastName: e.target.value })} maxLength={80} />
                </div>
              </div>
              <div className={event.collectAttendeePhone ? "grid grid-cols-1 sm:grid-cols-2 gap-3" : ""}>
                <div>
                  <label htmlFor={`a${a.key}-email`} className={labelClass}>
                    Email{event.attendeeEmailRequired ? " *" : " (optional)"}
                  </label>
                  <input id={`a${a.key}-email`} type="email" className={inputClass} style={{ borderColor }} value={a.email} onChange={(e) => updateOther(a.key, { email: e.target.value })} />
                </div>
                {event.collectAttendeePhone && (
                  <div>
                    <label htmlFor={`a${a.key}-phone`} className={labelClass}>
                      Phone (optional)
                    </label>
                    <input id={`a${a.key}-phone`} type="tel" className={inputClass} style={{ borderColor }} value={a.phone} onChange={(e) => updateOther(a.key, { phone: e.target.value })} />
                  </div>
                )}
              </div>
              {attendeeFields.map((f) => (
                <FieldInput key={f.id} field={f} idPrefix={`a${a.key}`} value={a.responses[f.id]} borderColor={borderColor} onChange={(v) => updateOther(a.key, { responses: { ...a.responses, [f.id]: v } })} />
              ))}
            </div>
          );
        })}

        {maxAttendees > 1 && (
          <button
            type="button"
            onClick={addAttendee}
            disabled={attendeeCount >= maxAttendees}
            className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-lg border disabled:opacity-50"
            style={{ borderColor, color: light.linkColor }}
          >
            <Plus className="w-4 h-4" aria-hidden="true" /> Add another attendee
          </button>
        )}
        {maxAttendees > 1 && (
          <p className="text-xs mt-2">
            {attendeeCount} of {maxAttendees} maximum
          </p>
        )}
      </section>

      {event.allowGroups && (
        <section>
          <label htmlFor="event-group" className={labelClass}>
            {event.groupLabel}
            {event.groupRequired ? " *" : " (optional)"}
          </label>
          <input id="event-group" className={inputClass} style={{ borderColor }} value={groupName} onChange={(e) => setGroupName(e.target.value)} maxLength={120} />
        </section>
      )}

      {registrationFields.length > 0 && (
        <section className="space-y-3">
          {registrationFields.map((f) => (
            <FieldInput key={f.id} field={f} idPrefix="reg" value={regResponses[f.id]} borderColor={borderColor} onChange={(v) => setRegResponses((p) => ({ ...p, [f.id]: v }))} />
          ))}
        </section>
      )}

      {addOns.length > 0 && (
        <section aria-labelledby="addons-heading">
          <h2 id="addons-heading" className={sectionTitle} style={{ color: light.headingColor }}>
            Add-ons
          </h2>
          <ul className="space-y-2">
            {addOns.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 rounded-xl border p-3" style={{ borderColor }}>
                <div className="min-w-0">
                  <p className="text-sm font-semibold" style={{ color: light.headingColor }}>
                    {a.name} · {formatCents(a.priceCents)}
                  </p>
                  {a.description && <p className="text-xs">{a.description}</p>}
                </div>
                {a.maxQuantity === 1 ? (
                  <input
                    type="checkbox"
                    aria-label={`Add ${a.name}`}
                    checked={(quantities[a.id] ?? 0) === 1}
                    onChange={(e) => setQuantities((p) => ({ ...p, [a.id]: e.target.checked ? 1 : 0 }))}
                  />
                ) : (
                  <select
                    aria-label={`Quantity of ${a.name}`}
                    className="px-2 py-1.5 rounded-lg border text-sm bg-white"
                    style={{ borderColor }}
                    value={quantities[a.id] ?? 0}
                    onChange={(e) => setQuantities((p) => ({ ...p, [a.id]: Number(e.target.value) }))}
                  >
                    {Array.from({ length: a.maxQuantity + 1 }, (_, q) => (
                      <option key={q} value={q}>
                        {q}
                      </option>
                    ))}
                  </select>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {event.allowOptionalDonation && (
        <section>
          <label htmlFor="event-donation" className={labelClass}>
            {event.donationPrompt?.trim() || "Would you like to make an additional gift?"} (optional)
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" aria-hidden="true">
              $
            </span>
            <input id="event-donation" inputMode="decimal" className={`${inputClass} pl-7`} style={{ borderColor }} placeholder="0.00" value={donation} onChange={(e) => setDonation(e.target.value)} />
          </div>
          {canGoMonthly && (
            <label htmlFor="event-donation-monthly" className="flex items-start gap-2 text-sm mt-2 cursor-pointer">
              <input id="event-donation-monthly" type="checkbox" className="mt-0.5" checked={monthly} onChange={(e) => setMonthly(e.target.checked)} />
              <span>
                Make this a monthly gift
                <span className="block text-xs opacity-80">You&apos;ll finish setting up the monthly gift right after you register — it isn&apos;t part of today&apos;s total.</span>
              </span>
            </label>
          )}
        </section>
      )}

      {/* Order summary */}
      <section aria-live="polite" className="rounded-xl border p-4 space-y-1.5 text-sm" style={{ borderColor }}>
        {pricing.ok ? (
          <>
            {event.priceCents > 0 && (
              <div className="flex justify-between">
                <span>
                  Registration{event.priceMode === "PER_ATTENDEE" ? ` (${pricing.totals.attendeeCount} × ${formatCents(event.priceCents)})` : ""}
                </span>
                <span>{formatCents(pricing.totals.registrationAmountCents)}</span>
              </div>
            )}
            {pricing.totals.addOnLines.map((l) => (
              <div key={l.addOnId} className="flex justify-between">
                <span>
                  {l.name}
                  {l.quantity > 1 ? ` × ${l.quantity}` : ""}
                </span>
                <span>{formatCents(l.lineTotalCents)}</span>
              </div>
            ))}
            {monthlyCents > 0 && (
              <div className="flex justify-between">
                <span>Monthly gift (set up after registering)</span>
                <span>{formatCents(monthlyCents)}/mo</span>
              </div>
            )}
            {pricing.totals.donationAmountCents > 0 && (
              <div className="flex justify-between">
                <span>Additional gift</span>
                <span>{formatCents(pricing.totals.donationAmountCents)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold pt-1.5 border-t" style={{ borderColor, color: light.headingColor }}>
              <span>Total</span>
              <span>{totalCents > 0 ? formatCents(totalCents) : "Free"}</span>
            </div>
          </>
        ) : (
          <p className="text-red-600">{pricing.error}</p>
        )}
      </section>

      {error && (
        <p ref={errorRef} role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {previewMode ? (
        <>
          {registrantSection}
          {needsPayment && (
            <section aria-label="Payment" className="space-y-3">
              <h2 className={sectionTitle} style={{ color: light.headingColor }}>
                Payment
              </h2>
              <div className="grid grid-cols-2 gap-2 text-sm font-semibold text-center">
                <span className="rounded-lg py-2" style={{ backgroundColor: light.buttonBackground, color: light.buttonText }}>Card</span>
                <span className="rounded-lg py-2 border" style={{ borderColor }}>Bank account</span>
              </div>
              <p className="text-xs">Secure card and bank fields appear here for registrants, along with Apple Pay and Google Pay when your organization has them enabled.</p>
            </section>
          )}
          <button
            type="button"
            disabled
            className="w-full py-3 rounded-lg font-semibold text-sm opacity-60 cursor-not-allowed"
            style={{ backgroundColor: light.buttonBackground, color: light.buttonText }}
          >
            {needsPayment ? `Pay ${formatCents(totalCents)} & Register` : "Complete registration"}
          </button>
        </>
      ) : needsPayment ? (
        checkout && organization.finixMerchantId ? (
          <GivingLinkForm
            slug={checkout.givingLinkSlug}
            finixMerchantId={organization.finixMerchantId}
            churchName={organization.name}
            light={light}
            amountType="VARIABLE"
            fixedAmountCents={null}
            minAmountCents={100}
            maxAmountCents={null}
            suggestedAmountsCents={[]}
            allowCustomAmount
            recurringEnabled={false}
            allowedFrequencies={["MONTHLY"]}
            allowedPaymentMethods={checkout.allowedPaymentMethods}
            feeCoverEnabled={checkout.feeCoverEnabled}
            feeCoverDefaultOn={checkout.feeCoverDefaultOn}
            donorFieldSettings={checkout.donorFieldSettings}
            collectMailingAddress={event.mailingAddressMode !== "HIDDEN"}
            pricing={checkout.pricing}
            thankYouMessage=""
            googlePayGatewayMerchantId={checkout.googlePayGatewayMerchantId}
            googlePayMerchantId={checkout.googlePayMerchantId}
            googlePayEnvironment={checkout.googlePayEnvironment}
            serverAvailability={checkout.serverAvailability}
            eventMode={{
              totalCents,
              phoneRequired: event.registrantPhoneRequired,
              validate: () => {
                const problem = validateLocal();
                if (problem) reportError(problem);
                return problem;
              },
              beforeCharge,
            }}
            onResult={(r) => {
              if ((r.step === "success" || r.step === "pending") && pendingCode.current) {
                setConfirmation({ code: pendingCode.current.code, paid: true, pendingBank: r.step === "pending", email: pendingCode.current.email, monthlyCents });
              }
            }}
          />
        ) : (
          <p role="alert" className="text-sm text-red-600">
            Online payment isn&apos;t available for this event right now. Please contact {organization.name}.
          </p>
        )
      ) : (
        <>
          {registrantSection}
          <button
            type="submit"
            disabled={submitting || !pricing.ok}
            className="w-full py-3 rounded-lg font-semibold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ backgroundColor: light.buttonBackground, color: light.buttonText }}
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            {submitting ? "Registering…" : "Complete registration"}
          </button>
        </>
      )}
    </form>
  );
}
