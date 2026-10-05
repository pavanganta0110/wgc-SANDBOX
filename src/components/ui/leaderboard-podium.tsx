"use client"

import * as React from "react"
import { Crown } from "lucide-react"

import { cn } from "@/lib/utils"
import { formatCents } from "@/lib/format"

interface LeaderboardRanking {
  userId: string
  userName: string
  rank: number
  value: number
}

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "?"
  return words
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("")
}

interface LeaderboardPodiumProps extends React.HTMLAttributes<HTMLDivElement> {
  rankings: LeaderboardRanking[]
}

// Display order left-to-right (2nd, 1st, 3rd) — the classic podium layout.
const PODIUM_ORDER = [2, 1, 3] as const
const BAR_HEIGHT: Record<number, string> = {
  1: "h-24",
  2: "h-16",
  3: "h-12",
}
const AVATAR_SIZE: Record<number, string> = {
  1: "h-14 w-14 text-base",
  2: "h-11 w-11 text-sm",
  3: "h-11 w-11 text-sm",
}
const AVATAR_COLOR: Record<number, string> = {
  1: "bg-amber-100 text-amber-700",
  2: "bg-slate-100 text-slate-600",
  3: "bg-orange-100 text-orange-700",
}
const BAR_COLOR: Record<number, string> = {
  1: "bg-amber-200",
  2: "bg-slate-200",
  3: "bg-orange-200",
}

const LeaderboardPodium = React.forwardRef<HTMLDivElement, LeaderboardPodiumProps>(
  ({ className, rankings, ...props }, ref) => {
    const byRank = new Map(rankings.map((r) => [r.rank, r]))

    return (
      <div ref={ref} className={cn("flex items-end justify-center gap-3 sm:gap-6", className)} {...props}>
        {PODIUM_ORDER.map((rank) => {
          const entry = byRank.get(rank)
          if (!entry) return <div key={rank} className="w-20 flex-1 sm:w-28" />

          return (
            <div key={entry.userId} className="flex w-20 flex-1 flex-col items-center gap-1.5 sm:w-28">
              <div className="relative">
                {rank === 1 && (
                  <Crown className="absolute -top-4 left-1/2 h-4 w-4 -translate-x-1/2 text-amber-400" fill="currentColor" />
                )}
                <div
                  className={cn(
                    "flex items-center justify-center rounded-full font-bold",
                    AVATAR_SIZE[rank],
                    AVATAR_COLOR[rank]
                  )}
                >
                  {initials(entry.userName)}
                </div>
              </div>
              <p className="w-full truncate text-center text-xs font-semibold text-slate-900">{entry.userName}</p>
              <p className="text-xs font-medium text-slate-500">{formatCents(entry.value)}</p>
              <div className={cn("flex w-full items-start justify-center rounded-t-lg pt-1", BAR_HEIGHT[rank], BAR_COLOR[rank])}>
                <span className="text-sm font-bold text-slate-700">{rank}</span>
              </div>
            </div>
          )
        })}
      </div>
    )
  }
)
LeaderboardPodium.displayName = "LeaderboardPodium"

export { LeaderboardPodium }
export type { LeaderboardRanking }
