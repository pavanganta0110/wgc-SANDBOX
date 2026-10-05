/**
 * Live visitor snapshot for System Health, pulled from PostHog's Query API
 * (HogQL) — PostHog already has this data since posthog-js runs on every
 * page (see instrumentation-client.ts); this module is read-only and never
 * writes anything to PostHog. Same no-op-when-unset pattern as Sentry's DSN
 * and SMS alerting: an unconfigured or failing call returns a clear
 * "not configured" / empty snapshot rather than throwing, so this can never
 * break System Health.
 *
 * Requires two server-only env vars (never NEXT_PUBLIC_ — these must stay
 * secret): POSTHOG_PERSONAL_API_KEY (Settings -> Personal API Keys in
 * PostHog, read access to Query/Insights) and POSTHOG_PROJECT_ID.
 */

const LIVE_WINDOW_MINUTES = 5; // matches activeUsersNow's own "active now" window in overviewStats.ts, for a consistent definition of "live" across the page
const BUCKET_LIMIT = 8; // top-N per breakdown — enough to be useful, never an unbounded list

export function isPostHogQueryConfigured(): boolean {
  return Boolean(process.env.POSTHOG_PERSONAL_API_KEY && process.env.POSTHOG_PROJECT_ID);
}

export interface Bucket {
  label: string;
  count: number;
}

export interface LiveVisitorSnapshot {
  configured: boolean;
  totalLiveVisitors: number;
  topPages: Bucket[];
  devices: Bucket[];
  countries: Bucket[];
  referrers: Bucket[];
  /** Set only when configured but the PostHog call itself failed — surfaced so the UI can say "temporarily unavailable" instead of silently showing zero. */
  error: string | null;
}

const EMPTY_SNAPSHOT: LiveVisitorSnapshot = {
  configured: false,
  totalLiveVisitors: 0,
  topPages: [],
  devices: [],
  countries: [],
  referrers: [],
  error: null,
};

function topBuckets(values: (string | null)[], fallbackLabel: string): Bucket[] {
  const counts = new Map<string, number>();
  for (const raw of values) {
    const label = raw && raw.trim() ? raw : fallbackLabel;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, BUCKET_LIMIT);
}

/**
 * Fetches recent $pageview events (last LIVE_WINDOW_MINUTES) via PostHog's
 * HogQL Query API and aggregates them into the breakdowns System Health
 * shows. "Live visitors" = distinct posthog distinct_id in that window —
 * the same "recent activity" definition used everywhere else on this page
 * (see activeUsersNow), not a literal live-second-by-second count.
 */
export async function getLiveVisitorSnapshot(): Promise<LiveVisitorSnapshot> {
  if (!isPostHogQueryConfigured()) return EMPTY_SNAPSHOT;

  try {
    const apiHost = process.env.POSTHOG_API_HOST || "https://us.i.posthog.com";
    const projectId = process.env.POSTHOG_PROJECT_ID;
    const query = `
      SELECT
        distinct_id,
        properties.$pathname AS page,
        properties.$device_type AS device,
        properties.$geoip_country_name AS country,
        properties.$referring_domain AS referrer
      FROM events
      WHERE event = '$pageview' AND timestamp > now() - INTERVAL ${LIVE_WINDOW_MINUTES} MINUTE
    `;

    const res = await fetch(`${apiHost}/api/projects/${projectId}/query/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.POSTHOG_PERSONAL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
      cache: "no-store",
    });

    if (!res.ok) {
      return { ...EMPTY_SNAPSHOT, configured: true, error: `PostHog query failed (${res.status})` };
    }

    const body = await res.json();
    const rows: unknown[] = Array.isArray(body?.results) ? body.results : [];

    const distinctIds = new Set<string>();
    const pages: (string | null)[] = [];
    const devices: (string | null)[] = [];
    const countries: (string | null)[] = [];
    const referrers: (string | null)[] = [];

    for (const row of rows) {
      if (!Array.isArray(row)) continue;
      const [distinctId, page, device, country, referrer] = row as (string | null)[];
      if (distinctId) distinctIds.add(distinctId);
      pages.push(page ?? null);
      devices.push(device ?? null);
      countries.push(country ?? null);
      referrers.push(referrer ?? null);
    }

    return {
      configured: true,
      totalLiveVisitors: distinctIds.size,
      topPages: topBuckets(pages, "(unknown page)"),
      devices: topBuckets(devices, "Unknown"),
      countries: topBuckets(countries, "Unknown"),
      referrers: topBuckets(referrers, "Direct / none"),
      error: null,
    };
  } catch (err) {
    console.error("[getLiveVisitorSnapshot] PostHog query failed:", err);
    return { ...EMPTY_SNAPSHOT, configured: true, error: err instanceof Error ? err.message : "PostHog query failed" };
  }
}
