"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { formatCents } from "@/lib/format"

interface LeaderboardRankingItem {
  userId: string
  rank: number
  userName: string
  byline?: string
  value: number
  displayed?: boolean
}

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "?"
  return words
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("")
}

interface LeaderboardRankingsProps extends React.HTMLAttributes<HTMLDivElement> {
  rankings: LeaderboardRankingItem[]
  currentUserId?: string
  showPagination?: boolean
  defaultPageSize?: number
}

const LeaderboardRankings = React.forwardRef<HTMLDivElement, LeaderboardRankingsProps>(
  ({ className, rankings, currentUserId, showPagination = false, defaultPageSize = 10, ...props }, ref) => {
    const visible = React.useMemo(() => rankings.filter((r) => r.displayed !== false), [rankings])
    const [page, setPage] = React.useState(0)

    const pageCount = showPagination ? Math.max(1, Math.ceil(visible.length / defaultPageSize)) : 1
    // Clamp instead of resetting to 0 whenever the underlying rankings array
    // shrinks (e.g. switching from "This Month" to "This Week") — keeps the
    // user on the closest valid page rather than always snapping back to
    // page 1 on every range change.
    const clampedPage = Math.min(page, pageCount - 1)
    const pageItems = showPagination
      ? visible.slice(clampedPage * defaultPageSize, clampedPage * defaultPageSize + defaultPageSize)
      : visible

    return (
      <div ref={ref} className={cn("space-y-1", className)} {...props}>
        {pageItems.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">No rankings yet.</p>
        ) : (
          pageItems.map((item) => (
            <div
              key={item.userId}
              className={cn(
                "flex items-center gap-3 rounded-xl px-2 py-2",
                item.userId === currentUserId && "bg-slate-50"
              )}
            >
              <span className="w-5 shrink-0 text-center text-xs font-bold text-slate-400">{item.rank}</span>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                {initials(item.userName)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">{item.userName}</p>
                {item.byline ? <p className="truncate text-xs text-slate-500">{item.byline}</p> : null}
              </div>
              <p className="shrink-0 text-sm font-semibold text-slate-900">{formatCents(item.value)}</p>
            </div>
          ))
        )}

        {showPagination && pageCount > 1 ? (
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={clampedPage === 0}
              className="text-xs font-semibold text-slate-500 hover:text-slate-700 disabled:opacity-40 disabled:hover:text-slate-500"
            >
              Previous
            </button>
            <span className="text-xs text-slate-400">
              Page {clampedPage + 1} of {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={clampedPage >= pageCount - 1}
              className="text-xs font-semibold text-slate-500 hover:text-slate-700 disabled:opacity-40 disabled:hover:text-slate-500"
            >
              Next
            </button>
          </div>
        ) : null}
      </div>
    )
  }
)
LeaderboardRankings.displayName = "LeaderboardRankings"

export { LeaderboardRankings }
export type { LeaderboardRankingItem }
