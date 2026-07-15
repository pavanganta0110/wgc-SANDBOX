"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ReactNode } from "react";

export default function ClickableTableRow({
  id,
  children,
  className = "",
  targetHref,
}: {
  id: string;
  children: ReactNode;
  className?: string;
  targetHref?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleClick = (e: React.MouseEvent<HTMLTableRowElement>) => {
    if ((e.target as HTMLElement).closest("button, a")) return;
    if (targetHref) {
      router.push(targetHref);
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set("id", id);
    router.push(`?${params.toString()}`, { scroll: false });
  };

  return (
    <tr onClick={handleClick} className={`cursor-pointer ${className}`}>
      {children}
    </tr>
  );
}
