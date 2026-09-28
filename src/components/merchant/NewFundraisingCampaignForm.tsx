"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import CampaignPagePreview from "@/components/campaigns/CampaignPagePreview";

const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

export default function NewFundraisingCampaignForm({
  churchName,
  churchLogoUrl,
}: {
  churchName: string;
  churchLogoUrl?: string | null;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [goalAmount, setGoalAmount] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleImageFileSelected = async (file: File | undefined) => {
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      toast.error("Only PNG, JPG, JPEG, and WEBP files are supported.");
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      toast.error("File too large. Maximum size is 5MB.");
      return;
    }

    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/merchant/campaigns/image-upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to upload image");
      }
      setImageUrl(data.imageUrl);
      toast.success("Image uploaded");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to upload image");
    } finally {
      setUploadingImage(false);
    }
  };

  const removeImage = () => {
    setImageUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Campaign name is required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/merchant/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          imageUrl: imageUrl || undefined,
          goalAmountCents: goalAmount ? Math.round(parseFloat(goalAmount) * 100) : undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to create campaign");
        return;
      }
      toast.success("Campaign created");
      router.push(`/merchant/campaigns/${data.campaign.id}`);
    } catch {
      toast.error("Failed to create campaign");
    } finally {
      setSubmitting(false);
    }
  };

  const goalAmountCents = goalAmount ? Math.round(parseFloat(goalAmount) * 100) : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
      <form onSubmit={onSubmit} className="space-y-5 bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Campaign Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="Spring Gala 2026"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            rows={3}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Campaign Image</label>
          {imageUrl && (
            <div className="mb-2 flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt="" className="w-20 h-20 object-cover rounded-lg border border-slate-200" />
              <button type="button" onClick={removeImage} className="text-xs font-semibold text-red-600 hover:underline">
                Remove
              </button>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_IMAGE_TYPES.join(",")}
            onChange={(e) => handleImageFileSelected(e.target.files?.[0])}
            disabled={uploadingImage}
            className="block w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
          />
          {uploadingImage && (
            <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
              <Loader2 className="w-3 h-3 animate-spin" /> Uploading…
            </p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Fundraising Goal (USD)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={goalAmount}
            onChange={(e) => setGoalAmount(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="250000"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <p className="text-xs text-slate-400">
          Campaigns start as a draft. You&apos;ll be able to add teams and fundraisers, then set the campaign to Active when you&apos;re ready to publish it.
        </p>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {submitting ? "Creating..." : "Create Campaign"}
        </button>
      </form>

      <div className="lg:sticky lg:top-6">
        <h4 className="text-sm font-bold text-slate-900 mb-1">Live Preview</h4>
        <p className="text-xs text-slate-400 mb-3">
          This shows what your campaign&apos;s public page will look like. Nothing here is saved or public until you click Create Campaign.
        </p>
        <CampaignPagePreview
          churchName={churchName}
          churchLogoUrl={churchLogoUrl}
          name={name}
          description={description.trim() || undefined}
          imageUrl={imageUrl}
          goalAmountCents={goalAmountCents}
          endDate={endDate || undefined}
        />
      </div>
    </div>
  );
}
