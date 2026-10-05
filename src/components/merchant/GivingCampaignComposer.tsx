"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { Loader2, X, Search, Mail, MessageSquare, Lock } from "lucide-react";
import { EVENT_AUDIENCE_SCOPES, EVENT_AUDIENCE_SCOPE_LABELS } from "@/lib/eventRegistration/audience";

interface GivingLinkOption {
  id: string;
  internalName: string;
  publicTitle: string;
  status: string;
}

interface DonorOption {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
}

type Channel = "EMAIL" | "TEXT";
// What this email is actually about — drives which GivingLink gets used
// (see the comment on GivingCampaign.givingLinkId in schema.prisma for why
// that can never be an independent choice once one of these is picked).
type TieMode = "NONE" | "FUNDRAISING" | "PLEDGE";
// Who receives it: hand-picked donors (the original flow) or an audience the
// server resolves from this organization's own records.
type AudienceSource = "SELECTED" | "ALL_DONORS" | "GIVING_PAGE" | "EVENT" | "IMPORTED_CONTACTS" | "NOT_GIVEN";

const MERGE_FIELDS = [
  { token: "{{firstName}}", label: "Donor first name" },
  { token: "{{orgName}}", label: "Your organization's name" },
  { token: "{{link}}", label: "Their personal giving link" },
];

const DEFAULT_EMAIL_BODY =
  "Hi {{firstName}},\n\n{{orgName}} would be grateful for your support. You can give securely here:\n{{link}}\n\nThank you!";
const DEFAULT_TEXT_BODY = "Hi {{firstName}}, {{orgName}} would be grateful for your support. Give securely here: {{link}}";

export default function GivingCampaignComposer() {
  const router = useRouter();

  const [channel, setChannel] = useState<Channel>("EMAIL");
  const [links, setLinks] = useState<GivingLinkOption[]>([]);
  const [givingLinkId, setGivingLinkId] = useState("");
  const [tieMode, setTieMode] = useState<TieMode>("NONE");
  const [fundraisingCampaigns, setFundraisingCampaigns] = useState<{ id: string; name: string }[] | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [campaignTeams, setCampaignTeams] = useState<{ id: string; name: string }[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [campaignFundraisers, setCampaignFundraisers] = useState<{ id: string; displayName: string }[]>([]);
  const [selectedFundraiserId, setSelectedFundraiserId] = useState("");
  const [pledgeCampaigns, setPledgeCampaigns] = useState<{ id: string; name: string }[] | null>(null);
  const [selectedPledgeCampaignId, setSelectedPledgeCampaignId] = useState("");
  const [name, setName] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBodyTemplate, setEmailBodyTemplate] = useState(DEFAULT_EMAIL_BODY);
  const [textBodyTemplate, setTextBodyTemplate] = useState(DEFAULT_TEXT_BODY);

  const [audienceSource, setAudienceSource] = useState<AudienceSource>("SELECTED");
  const [audienceLinkId, setAudienceLinkId] = useState("");
  const [audienceEventId, setAudienceEventId] = useState("");
  const [audienceEventScope, setAudienceEventScope] = useState("ALL_ATTENDEES");
  // "Send now" vs "repeat every month" (email + a rule-based audience only).
  const [repeatMonthly, setRepeatMonthly] = useState(false);
  const [startsOn, setStartsOn] = useState(() => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const [endsOn, setEndsOn] = useState("");
  const [events, setEvents] = useState<{ id: string; name: string }[] | null>(null);
  // The last answer from the audience-count endpoint, tagged with the request it answers so a stale answer is never shown for a changed selection.
  const [audienceResult, setAudienceResult] = useState<{ key: string; value: { count: number; sample: string[] } | { error: string } } | null>(null);
  const [donorQuery, setDonorQuery] = useState("");
  const [donorResults, setDonorResults] = useState<DonorOption[]>([]);
  const [donorListTruncated, setDonorListTruncated] = useState(false);
  const [selectedDonors, setSelectedDonors] = useState<DonorOption[]>([]);
  const [searching, setSearching] = useState(false);

  const [preview, setPreview] = useState<{
    subject: string | null;
    body: string;
    churchName?: string;
    logoUrl?: string | null;
    senderName?: string | null;
    badgeColor?: string | null;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sendProgress, setSendProgress] = useState<{ sent: number; total: number } | null>(null);
  const [smsAddonActive, setSmsAddonActive] = useState<boolean | null>(null);
  const [smsConfigured, setSmsConfigured] = useState(true);

  useEffect(() => {
    fetch("/api/merchant/giving-links")
      .then((res) => res.json())
      .then((data) => setLinks((data.links || []).filter((l: GivingLinkOption) => l.status === "ACTIVE")))
      .catch(() => toast.error("Failed to load giving links"));
  }, []);

  useEffect(() => {
    fetch("/api/merchant/campaigns?status=ACTIVE")
      .then((res) => (res.ok ? res.json() : { campaigns: [] }))
      .then((data) => setFundraisingCampaigns(data.campaigns || []))
      .catch(() => setFundraisingCampaigns([]));
    fetch("/api/merchant/pledge-campaigns?status=ACTIVE")
      .then((res) => (res.ok ? res.json() : { campaigns: [] }))
      .then((data) => setPledgeCampaigns(data.campaigns || []))
      .catch(() => setPledgeCampaigns([]));
  }, []);

  // Teams/fundraisers are scoped to whichever fundraising campaign is
  // picked — reset both the moment the campaign choice changes, same
  // rationale as RecordExternalDonationForm's identical effect.
  useEffect(() => {
    setSelectedTeamId("");
    setSelectedFundraiserId("");
    if (!selectedCampaignId) {
      setCampaignTeams([]);
      setCampaignFundraisers([]);
      return;
    }
    let cancelled = false;
    Promise.all([
      fetch(`/api/merchant/campaigns/${selectedCampaignId}/teams`).then((res) => (res.ok ? res.json() : { teams: [] })),
      fetch(`/api/merchant/campaigns/${selectedCampaignId}/fundraisers`).then((res) => (res.ok ? res.json() : { fundraisers: [] })),
    ])
      .then(([teamsJson, fundraisersJson]) => {
        if (cancelled) return;
        setCampaignTeams(teamsJson.teams || []);
        setCampaignFundraisers(fundraisersJson.fundraisers || []);
      })
      .catch(() => {
        if (!cancelled) {
          setCampaignTeams([]);
          setCampaignFundraisers([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCampaignId]);

  // Switching tie mode clears whichever side's selections no longer apply,
  // so a leftover id from one mode can never be submitted under another.
  useEffect(() => {
    if (tieMode !== "FUNDRAISING") {
      setSelectedCampaignId("");
    }
    if (tieMode !== "PLEDGE") {
      setSelectedPledgeCampaignId("");
    }
  }, [tieMode]);

  useEffect(() => {
    fetch("/api/merchant/sms-addon")
      .then((res) => res.json())
      .then((data) => {
        setSmsAddonActive(Boolean(data.active));
        setSmsConfigured(Boolean(data.smsConfigured));
      })
      .catch(() => setSmsAddonActive(false));
  }, []);

  // Empty query -> browse-all (capped, alphabetical) so donors can be
  // multi-selected without typing anything; a query narrows the same list
  // via server-side search. Runs on mount and on every channel switch too,
  // since eligibility (has email vs. has phone) depends on channel.
  useEffect(() => {
    const timeout = setTimeout(() => {
      setSearching(true);
      const q = donorQuery.trim();
      const url = q ? `/api/merchant/donors/search?q=${encodeURIComponent(q)}` : "/api/merchant/donors/search";
      fetch(url)
        .then((res) => res.json())
        .then((data) => {
          setDonorResults((data.donors || []).filter((d: DonorOption) => (channel === "TEXT" ? d.phone : d.email)));
          setDonorListTruncated(Boolean(data.truncated));
        })
        .catch(() => {})
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timeout);
  }, [donorQuery, channel]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetch("/api/merchant/giving-campaigns/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, emailSubject, emailBodyTemplate, textBodyTemplate }),
      })
        .then((res) => res.json())
        .then((data) =>
          setPreview({
            subject: data.subject,
            body: data.body,
            churchName: data.churchName,
            logoUrl: data.logoUrl,
            senderName: data.senderName,
            badgeColor: data.badgeColor,
          })
        )
        .catch(() => {});
    }, 300);
    return () => clearTimeout(timeout);
  }, [channel, emailSubject, emailBodyTemplate, textBodyTemplate]);

  // Events are optional (permission-gated): a failed load just hides the option.
  useEffect(() => {
    fetch("/api/merchant/events")
      .then((res) => (res.ok ? res.json() : { events: null }))
      .then((data) => setEvents(Array.isArray(data.events) ? data.events.map((e: { id: string; name: string }) => ({ id: e.id, name: e.name })) : null))
      .catch(() => setEvents(null));
  }, []);

  const audienceReady =
    audienceSource === "SELECTED" ||
    audienceSource === "ALL_DONORS" ||
    audienceSource === "IMPORTED_CONTACTS" ||
    audienceSource === "NOT_GIVEN" ||
    (audienceSource === "GIVING_PAGE" && Boolean(audienceLinkId)) ||
    (audienceSource === "EVENT" && Boolean(audienceEventId));

  const repeatingNow = repeatMonthly && channel === "EMAIL" && audienceSource !== "SELECTED";

  const audienceKey = JSON.stringify([audienceSource, audienceLinkId, audienceEventId, audienceEventScope, channel]);
  const audiencePreview = audienceSource !== "SELECTED" && audienceReady && audienceResult?.key === audienceKey ? audienceResult.value : null;

  useEffect(() => {
    if (audienceSource === "SELECTED" || !audienceReady) return;
    let cancelled = false;
    fetch("/api/merchant/giving-campaigns/audience", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel,
        audience: { source: audienceSource, givingLinkId: audienceLinkId || undefined, eventId: audienceEventId || undefined, eventScope: audienceEventScope },
      }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        setAudienceResult({ key: audienceKey, value: res.ok ? { count: data.count, sample: data.sample } : { error: data.error || "Couldn't load this audience." } });
      })
      .catch(() => !cancelled && setAudienceResult({ key: audienceKey, value: { error: "Couldn't load this audience." } }));
    return () => {
      cancelled = true;
    };
  }, [audienceSource, audienceReady, audienceLinkId, audienceEventId, audienceEventScope, channel, audienceKey]);

  const switchChannel = (next: Channel) => {
    if (next === channel) return;
    if (next === "TEXT" && smsAddonActive === false) {
      toast.error(smsConfigured ? "Text messaging is a paid add-on — subscribe from Billing Plan to unlock it." : "Text messaging isn't available yet — coming soon.");
      return;
    }
    setChannel(next);
    if (next === "TEXT" && audienceSource === "EVENT") setAudienceSource("SELECTED");
    // A donor valid for one channel (has an email) may not be valid for the
    // other (no phone on file, or vice versa) — clearing avoids silently
    // dropping them at send time with no explanation.
    setSelectedDonors([]);
    setDonorQuery("");
    setDonorResults([]);
  };

  // Toggles one donor in/out of the selection — deliberately does not clear
  // donorQuery/donorResults the way the old single-pick dropdown did, so
  // the list stays visible and multiple donors can be checked in sequence.
  const toggleDonor = (donor: DonorOption) => {
    setSelectedDonors((prev) =>
      prev.some((d) => d.id === donor.id) ? prev.filter((d) => d.id !== donor.id) : [...prev, donor]
    );
  };

  const removeDonor = (id: string) => {
    setSelectedDonors((prev) => prev.filter((d) => d.id !== id));
  };

  const allVisibleSelected = donorResults.length > 0 && donorResults.every((d) => selectedDonors.some((s) => s.id === d.id));

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedDonors((prev) => prev.filter((d) => !donorResults.some((r) => r.id === d.id)));
    } else {
      setSelectedDonors((prev) => {
        const existingIds = new Set(prev.map((d) => d.id));
        return [...prev, ...donorResults.filter((d) => !existingIds.has(d.id))];
      });
    }
  };

  const insertMergeField = (token: string) => {
    if (channel === "TEXT") {
      setTextBodyTemplate((prev) => `${prev}${prev.endsWith(" ") || prev.length === 0 ? "" : " "}${token}`);
    } else {
      setEmailBodyTemplate((prev) => `${prev}${prev.endsWith(" ") || prev.length === 0 ? "" : " "}${token}`);
    }
  };

  const createAndSend = async () => {
    const messageReady = channel === "TEXT" ? textBodyTemplate.trim() : emailSubject.trim() && emailBodyTemplate.trim();
    const destinationReady =
      tieMode === "FUNDRAISING" ? Boolean(selectedCampaignId) : tieMode === "PLEDGE" ? Boolean(selectedPledgeCampaignId) : Boolean(givingLinkId);
    const repeating = repeatMonthly && channel === "EMAIL" && audienceSource !== "SELECTED";
    const recipientsReady = audienceSource === "SELECTED" ? selectedDonors.length > 0 : repeating ? audienceReady : audienceReady && audiencePreview !== null && "count" in audiencePreview && audiencePreview.count > 0;
    if (!name.trim() || !destinationReady || !messageReady || !recipientsReady) {
      const destinationLabel = tieMode === "NONE" ? "giving link" : tieMode === "FUNDRAISING" ? "fundraising campaign" : "pledge campaign";
      toast.error(
        channel === "TEXT"
          ? `Fill in a name, ${destinationLabel}, message, and at least one donor.`
          : `Fill in a name, ${destinationLabel}, subject, message, and at least one donor.`
      );
      return;
    }
    setSubmitting(true);
    try {
      const createRes = await fetch("/api/merchant/giving-campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          givingLinkId: tieMode === "NONE" ? givingLinkId : undefined,
          fundraisingCampaignId: tieMode === "FUNDRAISING" ? selectedCampaignId : undefined,
          campaignTeamId: tieMode === "FUNDRAISING" ? selectedTeamId || undefined : undefined,
          campaignFundraiserId: tieMode === "FUNDRAISING" ? selectedFundraiserId || undefined : undefined,
          pledgeCampaignId: tieMode === "PLEDGE" ? selectedPledgeCampaignId : undefined,
          channel,
          emailSubject,
          emailBodyTemplate,
          textBodyTemplate,
          donorIds: audienceSource === "SELECTED" ? selectedDonors.map((d) => d.id) : undefined,
          audience: {
            source: audienceSource,
            givingLinkId: audienceSource === "GIVING_PAGE" ? audienceLinkId : undefined,
            eventId: audienceSource === "EVENT" ? audienceEventId : undefined,
            eventScope: audienceSource === "EVENT" ? audienceEventScope : undefined,
          },
          schedule: repeating ? { repeat: "MONTHLY", startsOn, endsOn: endsOn || undefined } : undefined,
        }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) throw new Error(createData.error || "Failed to create campaign");

      // A repeating campaign is only scheduled here — the monthly runs send
      // themselves, so there's nothing to drive from the browser.
      if (createData.scheduled) {
        toast.success("Scheduled — it will send every month");
        router.push("/merchant/giving-campaigns");
        return;
      }

      const campaignId = createData.campaign.id;
      const total = createData.recipientCount;
      setSendProgress({ sent: 0, total });

      // Drives the same chunked-processing shape as bulkStatementJobs.ts —
      // keep calling send-chunk until the server says done.
      let done = false;
      while (!done) {
        const chunkRes = await fetch(`/api/merchant/giving-campaigns/${campaignId}/send-chunk`, { method: "POST" });
        const chunkData = await chunkRes.json();
        if (!chunkRes.ok) throw new Error(chunkData.error || "Failed to send");
        done = chunkData.done;
        setSendProgress({ sent: total - chunkData.remaining, total });
      }

      toast.success("Campaign sent");
      router.push(`/merchant/giving-campaigns/${campaignId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send campaign");
      setSubmitting(false);
      setSendProgress(null);
    }
  };

  if (sendProgress) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 text-center max-w-md mx-auto">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400 mx-auto mb-4" />
        <p className="text-sm font-semibold text-slate-900 mb-1">Sending…</p>
        <p className="text-xs text-slate-500">
          {sendProgress.sent} of {sendProgress.total} sent
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-6">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h3 className="text-sm font-bold text-slate-900 mb-4">Campaign Details</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Send by</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => switchChannel("EMAIL")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                    channel === "EMAIL" ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <Mail className="w-4 h-4" /> Email
                </button>
                <button
                  type="button"
                  onClick={() => switchChannel("TEXT")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                    channel === "TEXT" ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {smsAddonActive === false ? <Lock className="w-3.5 h-3.5" /> : <MessageSquare className="w-4 h-4" />}
                  Text
                </button>
              </div>
              {smsAddonActive === false && (
                <p className="text-xs text-slate-500 mt-1.5">
                  {smsConfigured ? (
                    <>
                      Text messaging is a paid add-on.{" "}
                      <Link href="/merchant/subscription" className="text-blue-600 hover:underline">
                        Subscribe from Billing Plan
                      </Link>{" "}
                      to unlock it.
                    </>
                  ) : (
                    "Text messaging isn't available yet — coming soon."
                  )}
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Campaign Name (internal only)</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={channel === "TEXT" ? "Fall Giving Text Blast" : "Fall Giving Email Blast"}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-slate-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Tie this email to</label>
              <div className="flex gap-2 mb-2">
                {(["NONE", "FUNDRAISING", "PLEDGE"] as TieMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setTieMode(mode)}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                      tieMode === mode ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {mode === "NONE" ? "Just a giving link" : mode === "FUNDRAISING" ? "Fundraising campaign" : "Pledge campaign"}
                  </button>
                ))}
              </div>

              {tieMode === "NONE" && (
                <select
                  value={givingLinkId}
                  onChange={(e) => setGivingLinkId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-slate-400"
                >
                  <option value="">Select a giving link…</option>
                  {links.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.internalName}
                    </option>
                  ))}
                </select>
              )}

              {tieMode === "FUNDRAISING" && (
                <div className="space-y-2">
                  <select
                    value={selectedCampaignId}
                    onChange={(e) => setSelectedCampaignId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-slate-400"
                  >
                    <option value="">
                      {fundraisingCampaigns === null ? "Loading campaigns…" : "Select a campaign…"}
                    </option>
                    {fundraisingCampaigns?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {selectedCampaignId && (
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={selectedTeamId}
                        onChange={(e) => setSelectedTeamId(e.target.value)}
                        disabled={campaignTeams.length === 0}
                        className="px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-slate-400 disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        <option value="">Whole campaign</option>
                        {campaignTeams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                      <select
                        value={selectedFundraiserId}
                        onChange={(e) => setSelectedFundraiserId(e.target.value)}
                        disabled={campaignFundraisers.length === 0}
                        className="px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-slate-400 disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        <option value="">No specific fundraiser</option>
                        {campaignFundraisers.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.displayName}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {selectedCampaignId && (
                    <p className="text-[11px] text-slate-500">
                      Gifts from this email will count toward{" "}
                      {campaignFundraisers.find((f) => f.id === selectedFundraiserId)?.displayName ||
                        campaignTeams.find((t) => t.id === selectedTeamId)?.name ||
                        fundraisingCampaigns?.find((c) => c.id === selectedCampaignId)?.name}
                      .
                    </p>
                  )}
                </div>
              )}

              {tieMode === "PLEDGE" && (
                <div className="space-y-2">
                  <select
                    value={selectedPledgeCampaignId}
                    onChange={(e) => setSelectedPledgeCampaignId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-slate-400"
                  >
                    <option value="">
                      {pledgeCampaigns === null ? "Loading pledge campaigns…" : "Select a pledge campaign…"}
                    </option>
                    {pledgeCampaigns?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-500">
                    Donors go to this campaign&apos;s giving page. To credit a gift toward a specific donor&apos;s pledge, link it from Pledges afterward.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h3 className="text-sm font-bold text-slate-900 mb-1">Recipients</h3>
          <label htmlFor="audience-source" className="block text-xs font-semibold text-slate-500 mb-1">Send to</label>
          <select
            id="audience-source"
            value={audienceSource}
            onChange={(e) => setAudienceSource(e.target.value as AudienceSource)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm mb-3 bg-white"
          >
            <option value="SELECTED">Specific donors (choose below)</option>
            <option value="ALL_DONORS">All donors</option>
            <option value="GIVING_PAGE">Donors from one giving page</option>
            {events && channel === "EMAIL" && <option value="EVENT">Event attendees</option>}
            <option value="IMPORTED_CONTACTS">Imported contacts</option>
            <option value="NOT_GIVEN">People who haven&apos;t given yet</option>
          </select>
          {audienceSource === "GIVING_PAGE" && (
            <select aria-label="Giving page" value={audienceLinkId} onChange={(e) => setAudienceLinkId(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm mb-3 bg-white">
              <option value="">Choose a giving page…</option>
              {links.map((l) => (
                <option key={l.id} value={l.id}>{l.internalName || l.publicTitle}</option>
              ))}
            </select>
          )}
          {audienceSource === "EVENT" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <select aria-label="Event" value={audienceEventId} onChange={(e) => setAudienceEventId(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white">
                <option value="">Choose an event…</option>
                {events?.map((ev) => (
                  <option key={ev.id} value={ev.id}>{ev.name}</option>
                ))}
              </select>
              <select aria-label="Event audience" value={audienceEventScope} onChange={(e) => setAudienceEventScope(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white">
                {EVENT_AUDIENCE_SCOPES.map((sc) => (
                  <option key={sc} value={sc}>{EVENT_AUDIENCE_SCOPE_LABELS[sc]}</option>
                ))}
              </select>
            </div>
          )}
          {audienceSource !== "SELECTED" && (
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-3 text-sm text-slate-700" aria-live="polite">
              {!audienceReady ? (
                "Choose an option above to see who will receive this."
              ) : audiencePreview === null ? (
                "Counting recipients…"
              ) : "error" in audiencePreview ? (
                <span className="text-red-600">{audiencePreview.error}</span>
              ) : (
                <>
                  <strong>{audiencePreview.count}</strong> {audiencePreview.count === 1 ? "person" : "people"} will receive this
                  {audiencePreview.sample.length > 0 && <span className="block text-xs text-slate-500 mt-1">Including {audiencePreview.sample.join(", ")}{audiencePreview.count > audiencePreview.sample.length ? "…" : ""}</span>}
                </>
              )}
            </div>
          )}
          {audienceSource !== "SELECTED" && channel === "EMAIL" && (
            <fieldset className="mt-4 space-y-3">
              <legend className="block text-xs font-semibold text-slate-500 mb-1">When to send</legend>
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input type="radio" name="send-timing" checked={!repeatMonthly} onChange={() => setRepeatMonthly(false)} /> Send now
              </label>
              <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
                <input type="radio" name="send-timing" className="mt-1" checked={repeatMonthly} onChange={() => setRepeatMonthly(true)} />
                <span>
                  Send automatically every month
                  <span className="block text-xs text-slate-500">Each month goes to whoever matches this audience that day — new donors are included, and anyone who unsubscribed is skipped.</span>
                </span>
              </label>
              {repeatMonthly && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-6">
                  <div>
                    <label htmlFor="series-start" className="block text-xs font-semibold text-slate-500 mb-1">First send</label>
                    <input id="series-start" type="date" value={startsOn} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setStartsOn(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
                  </div>
                  <div>
                    <label htmlFor="series-end" className="block text-xs font-semibold text-slate-500 mb-1">Stop after (optional)</label>
                    <input id="series-end" type="date" value={endsOn} min={startsOn} onChange={(e) => setEndsOn(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
                  </div>
                  <p className="sm:col-span-2 text-xs text-slate-500">Then the same day each month (the 28th at the latest). You can pause or stop it any time from the campaigns list.</p>
                </div>
              )}
            </fieldset>
          )}
          {audienceSource === "SELECTED" && (
            <>
          <p className="text-xs text-slate-500 mb-3">
            {channel === "TEXT" ? "Only donors with a phone number on file can be added." : "Only donors with an email on file can be added."}
          </p>
          <div className="relative mb-3">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={donorQuery}
              onChange={(e) => setDonorQuery(e.target.value)}
              placeholder={channel === "TEXT" ? "Search donors by name or phone…" : "Search donors by name or email…"}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-slate-400"
            />
            {searching && <Loader2 className="w-4 h-4 animate-spin text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />}
          </div>

          <div className="border border-slate-200 rounded-lg mb-3 overflow-hidden">
            {donorResults.length > 0 ? (
              <>
                <button
                  type="button"
                  onClick={toggleSelectAllVisible}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-600 bg-slate-50 border-b border-slate-200 hover:bg-slate-100"
                >
                  <input type="checkbox" checked={allVisibleSelected} onChange={() => {}} className="pointer-events-none" />
                  {allVisibleSelected ? "Deselect all shown" : `Select all shown (${donorResults.length})`}
                </button>
                <div className="max-h-56 overflow-y-auto">
                  {donorResults.map((d) => {
                    const isSelected = selectedDonors.some((s) => s.id === d.id);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => toggleDonor(d)}
                        className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2.5 hover:bg-slate-50 ${isSelected ? "bg-slate-50" : ""}`}
                      >
                        <input type="checkbox" checked={isSelected} onChange={() => {}} className="pointer-events-none shrink-0" />
                        <span className="flex flex-col min-w-0">
                          <span className="font-medium text-slate-800 truncate">{d.name || "Unnamed donor"}</span>
                          <span className="text-xs text-slate-500 truncate">{channel === "TEXT" ? d.phone : d.email}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                {donorListTruncated && (
                  <p className="text-[11px] text-slate-400 px-3 py-2 border-t border-slate-100">
                    Showing the first 500 donors — search above to find someone else.
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-slate-400 px-3 py-4 text-center">
                {searching
                  ? "Loading donors…"
                  : donorQuery.trim()
                  ? "No matching donors found."
                  : channel === "TEXT"
                  ? "No donors with a phone number on file yet."
                  : "No donors with an email on file yet."}
              </p>
            )}
          </div>

          {selectedDonors.length === 0 ? (
            <p className="text-xs text-slate-400">No donors added yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {selectedDonors.map((d) => (
                <span key={d.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-xs font-medium text-slate-700">
                  {d.name || (channel === "TEXT" ? d.phone : d.email)}
                  <button onClick={() => removeDonor(d.id)}>
                    <X className="w-3 h-3 text-slate-400 hover:text-slate-700" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <p className="text-xs text-slate-500 mt-3">{selectedDonors.length} donor{selectedDonors.length === 1 ? "" : "s"} selected</p>
            </>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h3 className="text-sm font-bold text-slate-900 mb-3">Message</h3>
          <div className="space-y-3">
            {channel === "EMAIL" && (
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Subject</label>
                <input
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-slate-400"
                />
              </div>
            )}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-500">{channel === "TEXT" ? "Text Message" : "Body"}</label>
                <div className="flex gap-1">
                  {MERGE_FIELDS.map((f) => (
                    <button
                      key={f.token}
                      type="button"
                      title={f.label}
                      onClick={() => insertMergeField(f.token)}
                      className="px-2 py-0.5 rounded-full bg-slate-100 text-[11px] font-mono text-slate-600 hover:bg-slate-200"
                    >
                      {f.token}
                    </button>
                  ))}
                </div>
              </div>
              {channel === "TEXT" ? (
                <>
                  <textarea
                    value={textBodyTemplate}
                    onChange={(e) => setTextBodyTemplate(e.target.value)}
                    rows={5}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-slate-400 font-mono"
                  />
                  <p className="text-xs text-slate-400 mt-1">{textBodyTemplate.length} characters (before merge fields expand)</p>
                </>
              ) : (
                <textarea
                  value={emailBodyTemplate}
                  onChange={(e) => setEmailBodyTemplate(e.target.value)}
                  rows={8}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-slate-400 font-mono"
                />
              )}
            </div>
          </div>
        </div>

        <button
          onClick={createAndSend}
          disabled={submitting}
          className="w-full px-4 py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-50"
        >
          {submitting
            ? repeatingNow ? "Scheduling…" : "Sending…"
            : repeatingNow
            ? "Schedule monthly campaign"
            : audienceSource === "SELECTED"
            ? `Send to ${selectedDonors.length || 0} Donor${selectedDonors.length === 1 ? "" : "s"}`
            : audiencePreview && "count" in audiencePreview
            ? `Send to ${audiencePreview.count} ${audiencePreview.count === 1 ? "Person" : "People"}`
            : "Send"}
        </button>
      </div>

      <div className="lg:sticky lg:top-6 self-start">
        <div className="bg-slate-50 rounded-2xl border border-slate-200 p-6">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Live Preview</p>
          {channel === "TEXT" ? (
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-1.5 mb-2 text-slate-400">
                <MessageSquare className="w-3.5 h-3.5" />
                <span className="text-[11px] font-semibold uppercase tracking-wide">Text Message</span>
              </div>
              <div className="bg-blue-600 text-white text-sm rounded-2xl rounded-bl-sm px-4 py-2.5 max-w-[85%] whitespace-pre-wrap">
                {preview?.body || "—"}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-5 text-center border-b border-slate-100 bg-slate-50">
                {preview?.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview.logoUrl} alt={preview.churchName || "Your organization"} className="h-10 mx-auto object-contain" />
                ) : (
                  <p className="text-sm font-bold text-slate-700">{preview?.churchName || "Your Organization"}</p>
                )}
              </div>
              <div className="px-4 pt-4">
                <span
                  className="inline-block px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide"
                  style={{
                    color: preview?.badgeColor || "#0B5DBC",
                    backgroundColor: `${preview?.badgeColor || "#0B5DBC"}15`,
                  }}
                >
                  A message from {preview?.churchName || "Your Organization"}
                </span>
              </div>
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="text-[11px] text-slate-400">Subject</p>
                <p className="text-sm font-semibold text-slate-900">{preview?.subject || "—"}</p>
              </div>
              <div className="px-4 py-4">
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{preview?.body || "—"}</p>
              </div>
              <div className="px-4 py-3 border-t border-slate-100">
                <p className="text-xs text-slate-500">
                  Thank you,
                  <br />
                  <span className="font-semibold text-slate-700">{preview?.senderName || preview?.churchName || "Your Organization"}</span>
                </p>
              </div>
            </div>
          )}
          <p className="text-xs text-slate-500 mt-3">
            Shown with sample data — each real recipient gets their own name and a unique tracked link. Logo, brand
            color, and signature all come from{" "}
            <Link href="/merchant/settings/branding" className="text-blue-600 hover:underline">
              Settings → Branding
            </Link>{" "}
            and{" "}
            <Link href="/merchant/settings/annual-statements" className="text-blue-600 hover:underline">
              Receipts & Annual Statements
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
