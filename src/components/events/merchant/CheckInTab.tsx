"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, CreditCard, Plus, Trash2, Volume2, VolumeX } from "lucide-react";
import toast from "react-hot-toast";
import jsQR from "jsqr";
import { formatCents } from "@/lib/format";
import { inputClass, labelClass, primaryButton, readApiError, secondaryButton } from "@/components/events/merchant/api";
import type { AddOnFormValue } from "@/components/events/merchant/EventSettingsForm";

type Outcome = "CHECKED_IN" | "ALREADY_CHECKED_IN" | "NOT_FOUND" | "NOT_CONFIRMED" | "WRONG_EVENT";
interface ScanResponse {
  outcome: Outcome;
  attendee?: { firstName: string; lastName: string; groupName: string | null; confirmationCode: string; checkedInAt: string | null };
}

const OUTCOME_STYLE: Record<Outcome, { box: string; title: string }> = {
  CHECKED_IN: { box: "bg-green-100 border-green-400 text-green-900", title: "Checked in" },
  ALREADY_CHECKED_IN: { box: "bg-amber-100 border-amber-400 text-amber-900", title: "Already checked in" },
  NOT_FOUND: { box: "bg-red-100 border-red-400 text-red-900", title: "Ticket not recognised" },
  NOT_CONFIRMED: { box: "bg-red-100 border-red-400 text-red-900", title: "Ticket not valid — registration isn't confirmed" },
  WRONG_EVENT: { box: "bg-red-100 border-red-400 text-red-900", title: "This ticket is for a different event" },
};

interface FoundAttendee {
  id: string;
  firstName: string;
  lastName: string;
  checkedIn: boolean;
  confirmationCode: string;
}

type Sound = "success" | "warning" | "error";

/** Short synthesized tones (no audio files): a bright two-note chime for a good check-in, a double beep for already-in, a low buzz for a bad ticket. */
function playTone(ctx: AudioContext, kind: Sound) {
  const notes: { f: number; at: number; dur: number; type: OscillatorType }[] =
    kind === "success"
      ? [{ f: 880, at: 0, dur: 0.12, type: "sine" }, { f: 1320, at: 0.12, dur: 0.22, type: "sine" }]
      : kind === "warning"
        ? [{ f: 660, at: 0, dur: 0.12, type: "square" }, { f: 660, at: 0.2, dur: 0.12, type: "square" }]
        : [{ f: 180, at: 0, dur: 0.45, type: "sawtooth" }];
  const t0 = ctx.currentTime;
  for (const n of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = n.type;
    osc.frequency.value = n.f;
    gain.gain.setValueAtTime(0.0001, t0 + n.at);
    gain.gain.exponentialRampToValueAtTime(0.25, t0 + n.at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0 + n.at);
    osc.stop(t0 + n.at + n.dur + 0.05);
  }
}

function Scanner({ eventId, canManage, onChange }: { eventId: string; canManage: boolean; onChange: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  const lastRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const [running, setRunning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const soundOnRef = useRef(true);
  const audioRef = useRef<AudioContext | null>(null);

  // Browsers only allow audio after a tap, so the context is created from the
  // "Start scanning" / sound-toggle / manual check-in clicks.
  const unlockAudio = useCallback(() => {
    try {
      if (!audioRef.current) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctor) audioRef.current = new Ctor();
      }
      void audioRef.current?.resume();
    } catch {
      // No audio support — the colour banner and vibration still work.
    }
  }, []);
  const beep = useCallback((kind: Sound) => {
    if (soundOnRef.current && audioRef.current) playTone(audioRef.current, kind);
  }, []);

  const [q, setQ] = useState("");
  const [found, setFound] = useState<FoundAttendee[] | null>(null);

  const submitCode = useCallback(
    async (code: string) => {
      if (busyRef.current) return;
      busyRef.current = true;
      try {
        const res = await fetch(`/api/merchant/events/${eventId}/check-in`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
        if (!res.ok) {
          toast.error(await readApiError(res, "Couldn't check that ticket in."));
          return;
        }
        const data = (await res.json()) as ScanResponse;
        setResult(data);
        beep(data.outcome === "CHECKED_IN" ? "success" : data.outcome === "ALREADY_CHECKED_IN" ? "warning" : "error");
        if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(data.outcome === "CHECKED_IN" ? 80 : [120, 60, 120]);
        if (data.outcome === "CHECKED_IN") onChange();
      } finally {
        busyRef.current = false;
      }
    },
    [eventId, onChange, beep]
  );

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setRunning(false);
  }, []);

  useEffect(() => stop, [stop]);

  // The scan loop re-schedules itself, so it lives behind a ref rather than
  // referencing its own binding.
  const tickRef = useRef<() => void>(() => {});
  useEffect(() => {
    tickRef.current = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
          // The same ticket held in front of the camera is read many times a
          // second — act on it once, then ignore it for a few seconds.
          if (code?.data && !(lastRef.current.code === code.data && Date.now() - lastRef.current.at < 4000)) {
            lastRef.current = { code: code.data, at: Date.now() };
            void submitCode(code.data);
          }
        }
      }
      rafRef.current = requestAnimationFrame(() => tickRef.current());
    };
  }, [submitCode]);

  async function start() {
    setCameraError(null);
    unlockAudio();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setRunning(true);
      rafRef.current = requestAnimationFrame(() => tickRef.current());
    } catch {
      setCameraError("Couldn't open the camera. Allow camera access in your browser (the page must be on https), or use the search below.");
    }
  }

  useEffect(() => {
    if (!q.trim()) return;
    const t = setTimeout(async () => {
      const res = await fetch(`/api/merchant/events/${eventId}/attendees?q=${encodeURIComponent(q.trim())}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setFound((data.attendees as FoundAttendee[]).slice(0, 12));
    }, 250);
    return () => clearTimeout(t);
  }, [q, eventId]);

  async function manualCheckIn(a: FoundAttendee) {
    unlockAudio();
    const res = await fetch(`/api/merchant/events/${eventId}/attendees/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkedIn: true }),
    });
    if (!res.ok) return void toast.error(await readApiError(res, "Couldn't check in."));
    setFound((prev) => prev?.map((x) => (x.id === a.id ? { ...x, checkedIn: true } : x)) ?? prev);
    beep("success");
    toast.success(`${a.firstName} ${a.lastName} checked in`);
    onChange();
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-900">Scan tickets</h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-pressed={soundOn}
            aria-label={soundOn ? "Mute check-in sounds" : "Unmute check-in sounds"}
            onClick={() => {
              const next = !soundOn;
              setSoundOn(next);
              soundOnRef.current = next;
              unlockAudio();
              if (next) beep("success");
            }}
            className={secondaryButton}
          >
            {soundOn ? <Volume2 className="w-4 h-4" aria-hidden="true" /> : <VolumeX className="w-4 h-4" aria-hidden="true" />}
          </button>
          {running ? (
            <button type="button" onClick={stop} className={secondaryButton}>
              <CameraOff className="w-4 h-4 mr-1.5" aria-hidden="true" /> Stop camera
            </button>
          ) : (
            <button type="button" onClick={() => void start()} disabled={!canManage} className={primaryButton}>
              <Camera className="w-4 h-4 mr-1.5" aria-hidden="true" /> Start scanning
            </button>
          )}
        </div>
      </div>

      <div className={`relative overflow-hidden rounded-xl bg-slate-900 ${running ? "" : "hidden"}`}>
        <video ref={videoRef} playsInline muted className="w-full max-h-[60vh] object-cover" />
        <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-white/70" />
      </div>
      <canvas ref={canvasRef} className="hidden" />
      {cameraError && <p role="alert" className="text-sm text-red-600">{cameraError}</p>}

      {result && (
        <div role="status" className={`rounded-xl border-2 px-4 py-4 ${OUTCOME_STYLE[result.outcome].box}`}>
          <p className="text-lg font-bold">{OUTCOME_STYLE[result.outcome].title}</p>
          {result.attendee && (
            <p className="text-base mt-1">
              {result.attendee.firstName} {result.attendee.lastName}
              {result.attendee.groupName ? ` · ${result.attendee.groupName}` : ""}
              {result.outcome === "ALREADY_CHECKED_IN" && result.attendee.checkedInAt ? ` · first in at ${new Date(result.attendee.checkedInAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}
            </p>
          )}
        </div>
      )}

      <div>
        <label htmlFor="ci-search" className={labelClass}>No QR code? Search by name, email or confirmation code</label>
        <input id="ci-search" className={inputClass} value={q} onChange={(e) => { setQ(e.target.value); if (!e.target.value.trim()) setFound(null); }} placeholder="e.g. Smith or K7M2QX4P" />
        {found && (
          <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {found.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">No match.</li>}
            {found.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="text-sm text-slate-900">{a.firstName} {a.lastName} <span className="font-mono text-xs text-slate-400">{a.confirmationCode}</span></span>
                {a.checkedIn ? (
                  <span className="text-xs font-semibold text-green-700">Checked in</span>
                ) : (
                  <button type="button" disabled={!canManage} onClick={() => void manualCheckIn(a)} className={secondaryButton}>Check in</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** A fresh idempotency key per sale, so a double-tapped "Complete sale" can't create two registrations. */
function newDoorKey(): string {
  return `door-${globalThis.crypto.randomUUID()}`;
}

interface DoorAttendee {
  key: number;
  firstName: string;
  lastName: string;
}

type DoorMethod = "CARD" | "CASH" | "CHECK" | "COMPLIMENTARY";

function DoorSales({
  eventId,
  priceCents,
  priceMode,
  maxAttendees,
  addOns,
  isActive,
  canManage,
  onChange,
}: {
  eventId: string;
  priceCents: number;
  priceMode: string;
  maxAttendees: number;
  addOns: AddOnFormValue[];
  isActive: boolean;
  canManage: boolean;
  onChange: () => void;
}) {
  const activeAddOns = addOns.filter((a) => a.isActive && a.id);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [guests, setGuests] = useState<DoorAttendee[]>([]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [method, setMethod] = useState<DoorMethod>("CASH");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ code: string; count: number; totalCents: number; method: DoorMethod } | null>(null);
  const keyRef = useRef(0);
  const [clientKey, setClientKey] = useState(newDoorKey);

  const attendeeCount = 1 + guests.length;
  const unitCount = priceMode === "PER_REGISTRATION" ? 1 : attendeeCount;
  const addOnTotal = activeAddOns.reduce((sum, a) => sum + a.priceCents * (qty[a.id as string] ?? 0), 0);
  const total = method === "COMPLIMENTARY" ? 0 : priceCents * unitCount + addOnTotal;

  function reset() {
    setFirst("");
    setLast("");
    setEmail("");
    setPhone("");
    setGuests([]);
    setQty({});
    setError(null);
    setClientKey(newDoorKey());
  }

  async function sell(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!first.trim() || !last.trim()) return setError("Enter the buyer's first and last name.");
    if (!email.trim()) return setError("Enter an email address — the ticket and receipt are sent there.");
    if (guests.some((g) => !g.firstName.trim() || !g.lastName.trim())) return setError("Every guest needs a first and last name.");
    setSaving(true);
    try {
      const res = await fetch(`/api/merchant/events/${eventId}/door-sale`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientKey,
          paymentMethod: method,
          registrant: { firstName: first.trim(), lastName: last.trim(), email: email.trim(), phone: phone.trim() || undefined },
          attendees: [
            { firstName: first.trim(), lastName: last.trim(), email: email.trim() },
            ...guests.map((g) => ({ firstName: g.firstName.trim(), lastName: g.lastName.trim() })),
          ],
          addOns: activeAddOns.filter((a) => (qty[a.id as string] ?? 0) > 0).map((a) => ({ addOnId: a.id, quantity: qty[a.id as string] })),
        }),
      });
      if (!res.ok) return setError(await readApiError(res, "Couldn't complete the sale."));
      const data = await res.json();
      // Card: straight to the payment page with these details and tickets
      // already filled in — no second form.
      if (data.payUrl) {
        window.location.assign(data.payUrl);
        return;
      }
      setDone({ code: data.confirmationCode, count: data.attendeeCount, totalCents: data.totalCents, method });
      reset();
      onChange();
    } catch {
      setError("Couldn't complete the sale. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  const methods: { id: DoorMethod; label: string }[] = [
    { id: "CASH", label: "Cash" },
    { id: "CHECK", label: "Check" },
    { id: "CARD", label: "Card" },
    ...(priceCents > 0 || addOnTotal > 0 ? [{ id: "COMPLIMENTARY" as const, label: "Free / comp" }] : []),
  ];

  return (
    <form onSubmit={sell} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
      <div>
        <h3 className="text-base font-semibold text-slate-900">Sell tickets at the door</h3>
        <p className="text-xs text-slate-500 mt-0.5">Walk-up buyers are checked in as soon as the sale completes, and the ticket is emailed to them.</p>
      </div>
      {!isActive && <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">Set the event to Active in Settings before selling at the door.</p>}

      {done && (
        <div role="status" className="rounded-xl border-2 border-green-400 bg-green-100 px-4 py-3 text-green-900">
          <p className="font-bold">Sold — {done.count} {done.count === 1 ? "person" : "people"} checked in</p>
          <p className="text-sm mt-0.5">
            {done.method === "COMPLIMENTARY" ? "Complimentary" : `${formatCents(done.totalCents)} ${done.method === "CHECK" ? "check" : "cash"} — record it in your till`} · code <span className="font-mono">{done.code}</span>
          </p>
        </div>
      )}

      <fieldset className="grid sm:grid-cols-2 gap-3">
        <legend className="sr-only">Buyer</legend>
        <div>
          <label htmlFor="ds-first" className={labelClass}>First name</label>
          <input id="ds-first" className={inputClass} value={first} onChange={(e) => setFirst(e.target.value)} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="ds-last" className={labelClass}>Last name</label>
          <input id="ds-last" className={inputClass} value={last} onChange={(e) => setLast(e.target.value)} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="ds-email" className={labelClass}>Email</label>
          <input id="ds-email" type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="ds-phone" className={labelClass}>Phone (optional)</label>
          <input id="ds-phone" type="tel" className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" />
        </div>
      </fieldset>

      {guests.map((g, i) => (
        <div key={g.key} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
          <div>
            <label htmlFor={`ds-g-first-${g.key}`} className={labelClass}>Guest {i + 1} first name</label>
            <input id={`ds-g-first-${g.key}`} className={inputClass} value={g.firstName} onChange={(e) => setGuests((p) => p.map((x) => (x.key === g.key ? { ...x, firstName: e.target.value } : x)))} />
          </div>
          <div>
            <label htmlFor={`ds-g-last-${g.key}`} className={labelClass}>Last name</label>
            <input id={`ds-g-last-${g.key}`} className={inputClass} value={g.lastName} onChange={(e) => setGuests((p) => p.map((x) => (x.key === g.key ? { ...x, lastName: e.target.value } : x)))} />
          </div>
          <button type="button" onClick={() => setGuests((p) => p.filter((x) => x.key !== g.key))} className={secondaryButton} aria-label={`Remove guest ${i + 1}`}>
            <Trash2 className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      ))}
      {attendeeCount < maxAttendees && (
        <button type="button" onClick={() => setGuests((p) => [...p, { key: ++keyRef.current, firstName: "", lastName: "" }])} className={secondaryButton}>
          <Plus className="w-4 h-4 mr-1.5" aria-hidden="true" /> Add another person
        </button>
      )}

      {activeAddOns.length > 0 && (
        <div className="space-y-2">
          <p className={labelClass}>Add-ons</p>
          {activeAddOns.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3">
              <label htmlFor={`ds-ao-${a.id}`} className="text-sm text-slate-800">{a.name} <span className="text-slate-500">· {formatCents(a.priceCents)}</span></label>
              <input id={`ds-ao-${a.id}`} type="number" min={0} max={a.maxQuantity} className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" value={qty[a.id as string] ?? 0} onChange={(e) => setQty((p) => ({ ...p, [a.id as string]: Math.max(0, Math.min(a.maxQuantity, Number(e.target.value) || 0)) }))} />
            </div>
          ))}
        </div>
      )}

      <div>
        <p className={labelClass}>Payment</p>
        <div role="radiogroup" aria-label="Payment method" className="flex flex-wrap gap-2">
          {methods.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={method === m.id}
              onClick={() => setMethod(m.id)}
              className={`rounded-lg border px-4 py-2 text-sm font-semibold ${method === m.id ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-slate-300 bg-white text-slate-700"}`}
            >
              {m.label}
            </button>
          ))}
        </div>
        {method === "CARD" && <p className="text-xs text-slate-500 mt-2">Card sales continue to the secure payment page with these details already filled in. The payment runs through Finix and is reconciled like any online registration, and the buyer is checked in automatically once it&apos;s paid.</p>}
        {(method === "CASH" || method === "CHECK") && <p className="text-xs text-slate-500 mt-2">Cash and checks are recorded on the registration only — they don&apos;t go through Finix, so they appear under &ldquo;Door cash/check&rdquo;, not Revenue.</p>}
      </div>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
        <p className="text-sm text-slate-600">{attendeeCount} {attendeeCount === 1 ? "ticket" : "tickets"} · <strong className="text-slate-900">{formatCents(total)}</strong></p>
        <button type="submit" disabled={saving || !canManage || !isActive} className={primaryButton}>
          {method === "CARD" ? (
            <>
              <CreditCard className="w-4 h-4 mr-1.5" aria-hidden="true" /> {saving ? "Please wait…" : "Continue to card payment"}
            </>
          ) : saving ? (
            "Please wait…"
          ) : (
            `Complete ${method === "COMPLIMENTARY" ? "free" : method === "CHECK" ? "check" : "cash"} sale`
          )}
        </button>
      </div>
    </form>
  );
}

export default function CheckInTab({
  eventId,
  priceCents,
  priceMode,
  maxAttendees,
  addOns,
  isActive,
  canManageAttendees,
  stats,
  onChange,
}: {
  eventId: string;
  priceCents: number;
  priceMode: string;
  maxAttendees: number;
  addOns: AddOnFormValue[];
  isActive: boolean;
  canManageAttendees: boolean;
  stats: { attendees: number; checkedIn: number; doorSales: number; doorCashCents: number } | null;
  onChange: () => void;
}) {
  return (
    <div className="space-y-6 max-w-2xl">
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          {[
            ["Checked in", `${stats.checkedIn} of ${stats.attendees}`],
            ["Door sales", String(stats.doorSales)],
            ["Door cash/check", formatCents(stats.doorCashCents)],
          ].map(([label, value]) => (
            <div key={label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3">
              <p className="text-xs text-slate-500 mb-0.5">{label}</p>
              <p className="text-lg font-bold text-slate-900">{value}</p>
            </div>
          ))}
        </div>
      )}
      {!canManageAttendees && <p className="text-sm text-slate-500">You can view this page, but only team members who can manage attendees can check people in or sell tickets.</p>}
      <Scanner eventId={eventId} canManage={canManageAttendees} onChange={onChange} />
      <DoorSales
        eventId={eventId}
        priceCents={priceCents}
        priceMode={priceMode}
        maxAttendees={maxAttendees}
        addOns={addOns}
        isActive={isActive}
        canManage={canManageAttendees}
        onChange={onChange}
      />
    </div>
  );
}
