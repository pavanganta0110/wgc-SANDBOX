# Fundraising Scorecard (fund.wgcpayments.com)

A free fundraising scorecard that sells a $100 written report and follows up by email. Built by Collin; runs inside this app and is served on its own address.

## How it is served
- `fund.wgcpayments.com` (and `fund.wgcpaymentssandbox.com`) are added as domains on the Vercel project. A DNS record for `fund` is needed at the registrar.
- On those hosts only, `next.config.ts` rewrites `/`, `/completescoreboard` and `/tryagain` to the static pages in `public/scorecard/`. Every other host and path is untouched. `SCORECARD_HOSTS` (comma separated) adds hosts.
- The API is `/api/scorecard/*`. Code: `src/lib/scorecard/`. Data: `ScorecardContact`, `ScorecardUsedTransfer`, `ScorecardRateHit` (also `prisma/manual/add_scorecard.sql`).

## The payment hand-off
The scorecard's giving link (slug `IPHa4RsF8WlK`, or `SCORECARD_GIVING_LINK_SLUG`) must have its **success return URL** set to `https://fund.wgcpayments.com/completescoreboard`. After a payment in the giving popup, the popup moves the page that opened it to that URL with `?transfer_id=TR...` and closes (`src/components/embed/EmbedBridge.tsx`). This only happens for return URLs on an allow-list (`src/lib/givingLinks/successReturn.ts`: the fund hosts, plus `GIVING_SUCCESS_REDIRECT_HOSTS`), so no other organization's link is affected.
The success page posts the transfer id to `/api/scorecard/purchase`. The server then confirms with Finix that the transfer SUCCEEDED, is a debit of at least `SCORECARD_REPORT_PRICE_CENTS` (default 10000), was paid to the giving link's own merchant, is not older than the buyer's arrival, and has not already paid for another report. Only then is the report written and emailed. Otherwise the report is held and an admin link is sent to the leads webhook.

## Environment variables (server only)
| Name | |
|---|---|
| `GEMINI_API_KEY` | Google Gemini (paid key from Google AI Studio). AI scoring and the written report. |
| `SCORECARD_SECRET` | 24+ random characters. Signs the unsubscribe and admin links. With it missing or weak, no link is trusted and no marketing email is sent. |
| `RESEND_API_KEY`, `EMAIL_FROM` | Already set for WGC. Scorecard email goes through them; `SCORECARD_MAIL_FROM` overrides the sender, `SCORECARD_REPLY_TO` sets the reply-to (e.g. collin@wgcpayments.com), `SCORECARD_MAIL_BCC` copies every email. |
| `SCORECARD_MAIL_POSTAL_ADDRESS` | Required. Printed in every follow-up (CAN-SPAM). With it missing, follow-ups are not sent. |
| `SCORECARD_SITE_URL` | `https://fund.wgcpayments.com` (sandbox: the sandbox fund host). |
| `SCORECARD_WEBHOOK_URL` | Optional. The Google Apps Script that adds each event to the leads sheet and emails Collin. |
| `SCORECARD_CONSULT_URL`, `SCORECARD_PLAN_URL` | Optional links used in the emails. |
| `SCORECARD_MODEL`, `SCORECARD_REPORT_MODEL` | Optional. Gemini model names for scoring and for the report. Defaults `gemini-flash-latest` and `gemini-pro-latest`; set a specific name to pin one (Google retires models, so check AI Studio). |
| `CRON_SECRET` | Already set. Protects `/api/scorecard/cron`. |

## Instant results email
When someone finishes the scorecard, they are emailed their scores at once (their fundraising and pitch scores, each area, where to start, and a link back to buy the $100 report), not a day later. It is a sales email, so it has the unsubscribe link and postal address and is not sent unless `SCORECARD_SECRET` and `SCORECARD_MAIL_POSTAL_ADDRESS` are set. Abuse limits: one per address per day, 3 a minute per visitor, never to board or team members invited by an ED, never to anyone who unsubscribed. A failure is logged and never affects the page.

## Follow-ups
`/api/scorecard/cron` runs once a day (this Vercel plan only allows daily crons). People who did not buy get emails on day 1, 4 and 10; buyers on day 2, 6 and 14. No one gets two within two days; board and team members invited by an ED get none. A payment still being confirmed is rechecked on each run for a day; the admin link covers anything else.

## Known limits
- Beta feedback is forwarded to the leads webhook (or the log if it is not set); it is not stored in the database.
- The fund hosts serve the whole app, not only the scorecard; only `/`, `/completescoreboard` and `/tryagain` are scorecard pages.
