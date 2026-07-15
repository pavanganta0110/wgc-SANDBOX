"use client";

import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { RowActionsMenu } from "@/components/merchant/PaymentDetailActions";

export default function DonorRowActions({
  donorId,
  isArchived,
  canArchive,
  canRestore,
  canExport,
  canEdit,
}: {
  donorId: string;
  isArchived: boolean;
  canArchive: boolean;
  canRestore: boolean;
  canExport: boolean;
  canEdit?: boolean;
}) {
  const router = useRouter();

  const archive = async () => {
    try {
      const res = await fetch(`/api/merchant/donors/${donorId}/archive`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to archive donor");
      toast.success("Donor archived");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to archive donor");
    }
  };

  const restore = async () => {
    try {
      const res = await fetch(`/api/merchant/donors/${donorId}/restore`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to restore donor");
      toast.success("Donor restored");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to restore donor");
    }
  };

  return (
    <RowActionsMenu
      items={[
        { label: "View Profile", onClick: () => router.push(`/merchant/donors/${donorId}`) },
        {
          label: "Edit Donor",
          onClick: () => router.push(`/merchant/donors/${donorId}?edit=1`),
          hidden: !canEdit,
        },
        {
          label: "Export Donor",
          onClick: () => window.open(`/api/merchant/donors/export?donorId=${donorId}`, "_blank"),
          hidden: !canExport,
        },
        {
          label: "Archive Donor",
          onClick: archive,
          hidden: isArchived || !canArchive,
          requiresConfirm: true,
          confirmMessage: "Archive this donor? They'll be hidden from the default list, but all history is preserved.",
        },
        {
          label: "Restore Donor",
          onClick: restore,
          hidden: !isArchived || !canRestore,
        },
      ]}
    />
  );
}
