"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import { formatCents } from "@/lib/format";
import CampaignPagePreview from "@/components/campaigns/CampaignPagePreview";
import LiveWallPreview from "@/components/campaigns/LiveWallPreview";

type Tab = "overview" | "teams" | "fundraisers" | "leaderboard" | "sharing" | "settings";

const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

interface CampaignSummary {
  id: string;
  name: string;
  slug: string;
  status: string;
  description: string | null;
  imageUrl: string | null;
  goalAmountCents: number | null;
  startDate: string | null;
  endDate: string | null;
  leaderboardEnabled: boolean;
  fundraiserSelfEditEnabled: boolean;
}

interface Overview {
  raisedCents: number;
  goalAmountCents: number | null;
  percentOfGoal: number | null;
  donorCount: number;
  averageGiftCents: number;
  recurringDonorCount: number;
  topFundraiser: { name: string; raisedCents: number } | null;
  topTeam: { name: string; raisedCents: number } | null;
  recentGifts: { id: string; amountCents: number; donorName: string | null; message: string | null; createdAt: string }[];
}

interface Team {
  id: string;
  name: string;
  slug: string;
  goalAmountCents: number | null;
  raisedCents: number;
}

interface Fundraiser {
  id: string;
  displayName: string;
  slug: string;
  goalAmountCents: number | null;
  raisedCents: number;
  campaignTeamId: string | null;
}

interface LeaderboardEntry {
  id: string;
  name: string;
  slug: string;
  raisedCents: number;
  goalAmountCents: number | null;
  percentOfGoal: number | null;
  donorCount: number;
}

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "teams", label: "Teams" },
  { key: "fundraisers", label: "Fundraisers" },
  { key: "leaderboard", label: "Leaderboard" },
  { key: "sharing", label: "Sharing" },
  { key: "settings", label: "Settings" },
];

function StatCard({ label, value, sublabel }: { label: string; value: string; sublabel?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-xl font-bold text-slate-900">{value}</p>
      {sublabel && <p className="text-xs text-slate-400 mt-0.5">{sublabel}</p>}
    </div>
  );
}

export default function CampaignDetailClient({
  campaign: initialCampaign,
  churchName,
  churchLogoUrl,
  canEdit,
  canManageRoster,
  canArchive,
}: {
  campaign: CampaignSummary;
  churchName: string;
  churchLogoUrl?: string | null;
  canEdit: boolean;
  canManageRoster: boolean;
  canArchive: boolean;
}) {
  const [campaign, setCampaign] = useState(initialCampaign);
  const [tab, setTab] = useState<Tab>("overview");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [fundraisers, setFundraisers] = useState<Fundraiser[] | null>(null);
  const [leaderboard, setLeaderboard] = useState<{ fundraisers: LeaderboardEntry[]; teams: LeaderboardEntry[] } | null>(null);

  const loadOverview = useCallback(async () => {
    const res = await fetch(`/api/merchant/campaigns/${campaign.id}/overview`);
    const data = await res.json();
    if (res.ok) setOverview(data.overview);
  }, [campaign.id]);

  const loadTeams = useCallback(async () => {
    const res = await fetch(`/api/merchant/campaigns/${campaign.id}/teams`);
    const data = await res.json();
    if (res.ok) setTeams(data.teams);
  }, [campaign.id]);

  const loadFundraisers = useCallback(async () => {
    const res = await fetch(`/api/merchant/campaigns/${campaign.id}/fundraisers`);
    const data = await res.json();
    if (res.ok) setFundraisers(data.fundraisers);
  }, [campaign.id]);

  const loadLeaderboard = useCallback(async () => {
    const res = await fetch(`/api/merchant/campaigns/${campaign.id}/leaderboard`);
    const data = await res.json();
    if (res.ok) setLeaderboard(data);
  }, [campaign.id]);

  useEffect(() => {
    // Deferred to a microtask so no setState call happens synchronously
    // within the effect body itself — each loader's first setState only
    // runs after the fetch's await boundary.
    void (async () => {
      if (tab === "overview" && !overview) await loadOverview();
      if (tab === "teams" && !teams) await loadTeams();
      if ((tab === "fundraisers" || tab === "sharing") && !fundraisers) await loadFundraisers();
      if (tab === "leaderboard" && !leaderboard) await loadLeaderboard();
    })();
  }, [tab, overview, teams, fundraisers, leaderboard, loadOverview, loadTeams, loadFundraisers, loadLeaderboard]);

  const updateCampaign = async (patch: Record<string, unknown>) => {
    const res = await fetch(`/api/merchant/campaigns/${campaign.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Update failed");
      return;
    }
    // The PATCH response's startDate/endDate come back as full ISO
    // datetime strings (Prisma Date -> JSON), but CampaignSummary and the
    // <input type="date"> fields that read it both expect a bare
    // YYYY-MM-DD — normalize here so every caller of updateCampaign gets a
    // consistently-shaped campaign back, not just the details form.
    const normalized = {
      ...data.campaign,
      startDate: data.campaign.startDate ? String(data.campaign.startDate).slice(0, 10) : null,
      endDate: data.campaign.endDate ? String(data.campaign.endDate).slice(0, 10) : null,
    };
    setCampaign((c) => ({ ...c, ...normalized }));
    toast.success("Saved");
  };

  // Draft state for the Settings tab's "Campaign Details" editor — kept
  // separate from `campaign` so typing doesn't PATCH on every keystroke and
  // the live preview can reflect in-progress, unsaved edits (same idea as
  // the New Campaign builder's live preview).
  const [detailsDraft, setDetailsDraft] = useState({
    name: campaign.name,
    description: campaign.description ?? "",
    imageUrl: campaign.imageUrl,
    goalAmount: campaign.goalAmountCents != null ? (campaign.goalAmountCents / 100).toString() : "",
    startDate: campaign.startDate ?? "",
    endDate: campaign.endDate ?? "",
  });
  const [uploadingDetailsImage, setUploadingDetailsImage] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [previewView, setPreviewView] = useState<"page" | "wall">("page");
  const detailsFileInputRef = useRef<HTMLInputElement>(null);

  const detailsDirty =
    detailsDraft.name !== campaign.name ||
    detailsDraft.description !== (campaign.description ?? "") ||
    detailsDraft.imageUrl !== campaign.imageUrl ||
    detailsDraft.goalAmount !== (campaign.goalAmountCents != null ? (campaign.goalAmountCents / 100).toString() : "") ||
    detailsDraft.startDate !== (campaign.startDate ?? "") ||
    detailsDraft.endDate !== (campaign.endDate ?? "");

  const resetDetailsDraft = () => {
    setDetailsDraft({
      name: campaign.name,
      description: campaign.description ?? "",
      imageUrl: campaign.imageUrl,
      goalAmount: campaign.goalAmountCents != null ? (campaign.goalAmountCents / 100).toString() : "",
      startDate: campaign.startDate ?? "",
      endDate: campaign.endDate ?? "",
    });
  };

  const handleDetailsImageSelected = async (file: File | undefined) => {
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      toast.error("Only PNG, JPG, JPEG, and WEBP files are supported.");
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      toast.error("File too large. Maximum size is 5MB.");
      return;
    }
    setUploadingDetailsImage(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/merchant/campaigns/image-upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to upload image");
      setDetailsDraft((d) => ({ ...d, imageUrl: data.imageUrl }));
      toast.success("Image uploaded");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to upload image");
    } finally {
      setUploadingDetailsImage(false);
    }
  };

  const saveDetails = async () => {
    if (!detailsDraft.name.trim()) {
      toast.error("Campaign name is required");
      return;
    }
    setSavingDetails(true);
    try {
      await updateCampaign({
        name: detailsDraft.name.trim(),
        description: detailsDraft.description.trim() || null,
        imageUrl: detailsDraft.imageUrl || null,
        goalAmountCents: detailsDraft.goalAmount ? Math.round(parseFloat(detailsDraft.goalAmount) * 100) : null,
        startDate: detailsDraft.startDate || null,
        endDate: detailsDraft.endDate || null,
      });
    } finally {
      setSavingDetails(false);
    }
  };

  const [newTeamName, setNewTeamName] = useState("");
  const createTeam = async () => {
    if (!newTeamName.trim()) return;
    const res = await fetch(`/api/merchant/campaigns/${campaign.id}/teams`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newTeamName.trim() }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Failed to create team");
      return;
    }
    setNewTeamName("");
    setTeams(null);
    loadTeams();
    toast.success("Team created");
  };

  const [newFundraiserName, setNewFundraiserName] = useState("");
  const [newFundraiserTeam, setNewFundraiserTeam] = useState("");
  const createFundraiser = async () => {
    if (!newFundraiserName.trim()) return;
    const res = await fetch(`/api/merchant/campaigns/${campaign.id}/fundraisers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: newFundraiserName.trim(), campaignTeamId: newFundraiserTeam || undefined }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Failed to create fundraiser");
      return;
    }
    setNewFundraiserName("");
    setNewFundraiserTeam("");
    setFundraisers(null);
    loadFundraisers();
    toast.success("Fundraiser created");
  };

  return (
    <div>
      <div className="sm:flex sm:items-center sm:justify-between mb-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-medium">{campaign.name}</h2>
            <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-700">{campaign.status}</span>
          </div>
          <Link href={`/c/${campaign.slug}`} target="_blank" className="text-sm text-indigo-600 hover:underline">
            wgcpayments.com/c/{campaign.slug} &rarr;
          </Link>
        </div>
        <Link
          href={`/c/${campaign.slug}/wall`}
          target="_blank"
          className="mt-4 sm:mt-0 inline-flex items-center rounded-lg bg-wgc-navy-950 px-4 py-2 text-sm font-semibold text-white hover:bg-wgc-navy-800"
        >
          Open Live Wall
        </Link>
      </div>

      <div className="border-b border-slate-200 mb-6">
        <nav className="-mb-px flex gap-6 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`whitespace-nowrap border-b-2 py-3 px-1 text-sm font-medium ${
                tab === t.key ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === "overview" && (
        <div className="space-y-6">
          {!overview ? (
            <p className="text-sm text-slate-400">Loading...</p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StatCard label="Raised" value={formatCents(overview.raisedCents)} sublabel={overview.percentOfGoal != null ? `${overview.percentOfGoal}% of goal` : undefined} />
                <StatCard label="Goal" value={overview.goalAmountCents != null ? formatCents(overview.goalAmountCents) : "—"} />
                <StatCard label="Donors" value={String(overview.donorCount)} />
                <StatCard label="Average Gift" value={formatCents(overview.averageGiftCents)} />
                <StatCard label="Recurring Donors" value={String(overview.recurringDonorCount)} />
                <StatCard label="Top Fundraiser" value={overview.topFundraiser?.name ?? "—"} sublabel={overview.topFundraiser ? formatCents(overview.topFundraiser.raisedCents) : undefined} />
                <StatCard label="Top Team" value={overview.topTeam?.name ?? "—"} sublabel={overview.topTeam ? formatCents(overview.topTeam.raisedCents) : undefined} />
              </div>

              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                <h3 className="text-sm font-semibold text-slate-900 mb-4">Recent Donations</h3>
                {overview.recentGifts.length === 0 ? (
                  <p className="text-sm text-slate-400">No donations yet.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {overview.recentGifts.map((g) => (
                      <li key={g.id} className="py-2 flex items-center justify-between text-sm">
                        <span className="text-slate-700">{g.donorName ?? "Anonymous"}</span>
                        <span className="font-semibold text-slate-900">{formatCents(g.amountCents)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {tab === "teams" && (
        <div className="space-y-6">
          {canManageRoster && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex gap-3">
              <input
                type="text"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                placeholder="Team name"
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <button onClick={createTeam} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
                Add Team
              </button>
            </div>
          )}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Team</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Goal</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Raised</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Public Page</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(teams ?? []).map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">{t.name}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{t.goalAmountCents != null ? formatCents(t.goalAmountCents) : "—"}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{formatCents(t.raisedCents)}</td>
                    <td className="px-4 py-3 text-sm">
                      <Link href={`/t/${t.slug}`} target="_blank" className="text-indigo-600 hover:underline">/t/{t.slug}</Link>
                    </td>
                  </tr>
                ))}
                {(teams ?? []).length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-400">No teams yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "fundraisers" && (
        <div className="space-y-6">
          {canManageRoster && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-wrap gap-3">
              <input
                type="text"
                value={newFundraiserName}
                onChange={(e) => setNewFundraiserName(e.target.value)}
                placeholder="Fundraiser name"
                className="flex-1 min-w-[180px] rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <select
                value={newFundraiserTeam}
                onChange={(e) => setNewFundraiserTeam(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">No team</option>
                {(teams ?? []).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <button onClick={createFundraiser} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
                Add Fundraiser
              </button>
            </div>
          )}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Fundraiser</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Goal</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Raised</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Public Page</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(fundraisers ?? []).map((f) => (
                  <tr key={f.id}>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">{f.displayName}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{f.goalAmountCents != null ? formatCents(f.goalAmountCents) : "—"}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{formatCents(f.raisedCents)}</td>
                    <td className="px-4 py-3 text-sm">
                      <Link href={`/f/${f.slug}`} target="_blank" className="text-indigo-600 hover:underline">/f/{f.slug}</Link>
                    </td>
                  </tr>
                ))}
                {(fundraisers ?? []).length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-400">No fundraisers yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "leaderboard" && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={campaign.leaderboardEnabled}
                disabled={!canEdit}
                onChange={(e) => updateCampaign({ leaderboardEnabled: e.target.checked })}
              />
              Show leaderboard on the public campaign page and live wall
            </label>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <h3 className="text-sm font-semibold text-slate-900 mb-4">Top Fundraisers</h3>
              <ol className="space-y-2">
                {(leaderboard?.fundraisers ?? []).map((f, i) => (
                  <li key={f.id} className="flex items-center justify-between text-sm">
                    <span>#{i + 1} {f.name} <span className="text-slate-400">({f.donorCount} donors)</span></span>
                    <span className="font-semibold">{formatCents(f.raisedCents)}</span>
                  </li>
                ))}
                {(leaderboard?.fundraisers ?? []).length === 0 && <p className="text-sm text-slate-400">No fundraisers yet.</p>}
              </ol>
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <h3 className="text-sm font-semibold text-slate-900 mb-4">Top Teams</h3>
              <ol className="space-y-2">
                {(leaderboard?.teams ?? []).map((t, i) => (
                  <li key={t.id} className="flex items-center justify-between text-sm">
                    <span>#{i + 1} {t.name} <span className="text-slate-400">({t.donorCount} donors)</span></span>
                    <span className="font-semibold">{formatCents(t.raisedCents)}</span>
                  </li>
                ))}
                {(leaderboard?.teams ?? []).length === 0 && <p className="text-sm text-slate-400">No teams yet.</p>}
              </ol>
            </div>
          </div>
        </div>
      )}

      {tab === "sharing" && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-semibold text-slate-900 mb-2">Campaign link</h3>
            <p className="text-sm text-indigo-600 mb-4">wgcpayments.com/c/{campaign.slug}</p>
            <h3 className="text-sm font-semibold text-slate-900 mb-2">Live donation wall</h3>
            <p className="text-sm text-indigo-600 mb-4">wgcpayments.com/c/{campaign.slug}/wall</p>
            <p className="text-xs text-slate-400">Share a fundraiser or team&apos;s own link from the Fundraisers/Teams tabs — each has its own page and URL.</p>
          </div>
        </div>
      )}

      {tab === "settings" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
              <h3 className="text-sm font-semibold text-slate-900">Campaign Details</h3>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Campaign Name</label>
                <input
                  type="text"
                  value={detailsDraft.name}
                  disabled={!canEdit}
                  onChange={(e) => setDetailsDraft((d) => ({ ...d, name: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea
                  value={detailsDraft.description}
                  disabled={!canEdit}
                  onChange={(e) => setDetailsDraft((d) => ({ ...d, description: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Campaign Image</label>
                {detailsDraft.imageUrl && (
                  <div className="mb-2 flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={detailsDraft.imageUrl} alt="" className="w-20 h-20 object-cover rounded-lg border border-slate-200" />
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => {
                          setDetailsDraft((d) => ({ ...d, imageUrl: null }));
                          if (detailsFileInputRef.current) detailsFileInputRef.current.value = "";
                        }}
                        className="text-xs font-semibold text-red-600 hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                )}
                {canEdit && (
                  <>
                    <input
                      ref={detailsFileInputRef}
                      type="file"
                      accept={ALLOWED_IMAGE_TYPES.join(",")}
                      onChange={(e) => handleDetailsImageSelected(e.target.files?.[0])}
                      disabled={uploadingDetailsImage}
                      className="block w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
                    />
                    {uploadingDetailsImage && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                        <Loader2 className="w-3 h-3 animate-spin" /> Uploading…
                      </p>
                    )}
                  </>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Fundraising Goal (USD)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={detailsDraft.goalAmount}
                  disabled={!canEdit}
                  onChange={(e) => setDetailsDraft((d) => ({ ...d, goalAmount: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={detailsDraft.startDate}
                    disabled={!canEdit}
                    onChange={(e) => setDetailsDraft((d) => ({ ...d, startDate: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={detailsDraft.endDate}
                    disabled={!canEdit}
                    onChange={(e) => setDetailsDraft((d) => ({ ...d, endDate: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              {canEdit && (
                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={saveDetails}
                    disabled={!detailsDirty || savingDetails}
                    className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {savingDetails ? "Saving..." : "Save Details"}
                  </button>
                  {detailsDirty && (
                    <button onClick={resetDetailsDraft} className="text-sm font-semibold text-slate-500 hover:text-slate-700">
                      Discard changes
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                <select
                  value={campaign.status}
                  disabled={!canEdit}
                  onChange={(e) => updateCampaign({ status: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="DRAFT">Draft</option>
                  <option value="ACTIVE">Active</option>
                  <option value="PAUSED">Paused</option>
                  <option value="COMPLETED">Completed</option>
                </select>
                <p className="text-xs text-slate-400 mt-1">Only Active campaigns are reachable on their public page and live wall.</p>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={campaign.fundraiserSelfEditEnabled}
                    disabled={!canEdit}
                    onChange={(e) => updateCampaign({ fundraiserSelfEditEnabled: e.target.checked })}
                  />
                  Allow fundraisers to log in and edit their own story, goal, and photo
                </label>
                <p className="text-xs text-slate-400 mt-1 ml-6">
                  Fundraisers never get access to this dashboard, donor payment details, or payouts — only their own public page.
                </p>
              </div>
              {canArchive && (
                <button
                  onClick={async () => {
                    if (!confirm("Archive this campaign? It will no longer be reachable publicly.")) return;
                    const res = await fetch(`/api/merchant/campaigns/${campaign.id}`, { method: "DELETE" });
                    if (res.ok) {
                      toast.success("Campaign archived");
                      window.location.href = "/merchant/campaigns";
                    } else {
                      const data = await res.json();
                      toast.error(data.error || "Failed to archive");
                    }
                  }}
                  className="text-sm font-semibold text-red-600 hover:underline"
                >
                  Archive Campaign
                </button>
              )}
            </div>
          </div>

          <div className="lg:sticky lg:top-6">
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-sm font-bold text-slate-900">Live Preview</h4>
              <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
                <button
                  type="button"
                  onClick={() => setPreviewView("page")}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    previewView === "page" ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  Campaign Page
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewView("wall")}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    previewView === "wall" ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  Live Wall
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-400 mb-3">
              {previewView === "page"
                ? "This shows what your campaign's public page will look like."
                : "This shows what the live donation wall will look like at your event."}{" "}
              {detailsDirty && "Unsaved changes below are shown here, but won't be public until you click Save Details."}
            </p>
            {previewView === "page" ? (
              <CampaignPagePreview
                churchName={churchName}
                churchLogoUrl={churchLogoUrl}
                name={detailsDraft.name}
                description={detailsDraft.description.trim() || undefined}
                imageUrl={detailsDraft.imageUrl}
                goalAmountCents={detailsDraft.goalAmount ? Math.round(parseFloat(detailsDraft.goalAmount) * 100) : null}
                endDate={detailsDraft.endDate || undefined}
              />
            ) : (
              <LiveWallPreview
                churchName={churchName}
                churchLogoUrl={churchLogoUrl}
                name={detailsDraft.name}
                goalAmountCents={detailsDraft.goalAmount ? Math.round(parseFloat(detailsDraft.goalAmount) * 100) : null}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
