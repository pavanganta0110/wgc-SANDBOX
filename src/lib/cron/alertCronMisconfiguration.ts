import { sendWgcEmail } from "@/lib/email";

// Fire-and-forget: a missing CRON_SECRET means every scheduled invocation
// of that job silently 500s forever until someone happens to notice
// something downstream is stale (this exact failure mode went undetected
// in production until a merchant-visible billing date went stale). The
// console.error alongside this call stays as-is; this adds an actual
// notification so the gap gets caught in minutes, not by accident later.
// sendWgcEmail already no-ops safely if RESEND_API_KEY isn't set, so this
// can never throw or change the route's existing 500 response.
export function alertCronMisconfiguration(jobName: string): void {
  sendWgcEmail({
    to: process.env.SUPPORT_EMAIL || "support@wgcpayments.com",
    subject: `[WGC Cron] ${jobName} is misconfigured — CRON_SECRET missing`,
    title: "Scheduled Job Misconfigured",
    badgeText: "CONFIGURATION ERROR",
    badgeColor: "#EF4444",
    bodyHtml: `<p><strong>Job:</strong> ${jobName}</p><p>CRON_SECRET is not set in production, so this job is failing on every scheduled run (returning 500) until it's added.</p>`,
  }).catch((err) => console.error(`Failed to send cron misconfiguration alert for ${jobName}:`, err));
}
