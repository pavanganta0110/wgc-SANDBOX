// Shared between the server page (reporting/donors/page.tsx) and the client
// component (DonorLeaderboardCard.tsx) — deliberately NOT in a "use client"
// file. A plain function export from a "use client" module can only be
// rendered as a Component or passed as a prop across the RSC boundary; it
// cannot be called directly from server code (confirmed in production:
// "Attempted to call parseLeaderboardRange() from the server but
// parseLeaderboardRange is on the client").
export const LEADERBOARD_RUN_OPTIONS = [
  { id: "this_week", label: "This Week" },
  { id: "mtd", label: "This Month" },
] as const;

export type LeaderboardRangeId = (typeof LEADERBOARD_RUN_OPTIONS)[number]["id"];

function isLeaderboardRangeId(value: string | undefined): value is LeaderboardRangeId {
  return LEADERBOARD_RUN_OPTIONS.some((o) => o.id === value);
}

export function parseLeaderboardRange(value: string | undefined): LeaderboardRangeId {
  return isLeaderboardRangeId(value) ? value : "this_week";
}
