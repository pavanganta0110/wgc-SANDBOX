// Follow-up email copy and timing. Edit the words here; the runner in service.ts decides who gets what and when.
import type { Contact } from "./types";
import { esc, scorecardConfig, sign } from "./config";

const AREA: Record<string, [string, string]> = {
  mission: ["Mission & who you serve", "Get your mission down to one sentence a donor could repeat, and attach a real number to the change you make."],
  ask: ["The ask", "Name a specific amount tied to a specific outcome, say it early, and come back to it at the close with a clear next step."],
  platform: ["Donor platform", "Make giving work in a few taps on a phone, offer recurring giving by default, and thank every gift within 48 hours."],
  relationships: ["Donor relationships", "Pick your top 25 donors and give each one a personal touch every quarter that asks for nothing."],
  board: ["Board", "Aim for 100% board giving this year, and ask each board member for three introductions this quarter."],
  leaders: ["Executive leadership", "Put your executive director in front of donors every week and protect that time on the calendar."],
};

const first = (c: Contact) => String(c.name || "").trim().split(/\s+/)[0] || "there";
const p = (s: string) => `<p style="margin:0 0 14px">${s}</p>`;
const btn = (href: string, label: string) =>
  `<p style="margin:18px 0"><a href="${esc(href)}" style="display:inline-block;background:#14284b;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px">${esc(label)}</a></p>`;
const wrap = (body: string) =>
  `<div style="font-family:Inter,Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.55;color:#14213a;max-width:600px">${body}</div>`;
const sig = p("The WGC Fundraising team");

/** The unsubscribe link for a contact, or null when links can't be signed (no secret). */
export function unsubscribeUrl(c: Pick<Contact, "id">): string | null {
  const t = sign(c.id);
  return t ? `${scorecardConfig().site}/api/scorecard/unsubscribe?id=${encodeURIComponent(c.id)}&t=${t}` : null;
}

export function footer(c: Contact): string {
  const un = unsubscribeUrl(c);
  const { postal } = scorecardConfig();
  return `<p style="margin:28px 0 0;font-size:12px;color:#5a6a85">You're getting this because you took the WGC Fundraising Scorecard.${
    un ? ` <a href="${esc(un)}" style="color:#5a6a85">Unsubscribe</a>` : ""
  }${postal ? `<br>${esc(postal)}` : ""}</p>`;
}

const buyLink = (c: Contact) => `${scorecardConfig().site}/?lead=${encodeURIComponent(c.id)}#report`;

function weakest(c: Contact): string | null {
  let k: string | null = null;
  for (const [key, v] of Object.entries(c.scores || {})) {
    if (v === "not sure" || v == null || v === "") continue;
    if (k === null || Number(v) < Number((c.scores || {})[k])) k = key;
  }
  return k;
}

/** What comes after the report: the $500 plan and ongoing support. */
export function nextSteps(): string {
  const { plan, consult } = scorecardConfig();
  return `<div style="margin:30px 0 0;padding:18px 20px;border:2px solid #1d4ed8;border-radius:10px">
  <p style="margin:0 0 6px;font-weight:700">Want help putting this into practice?</p>
  <p style="margin:0 0 10px">The $500 plan adds a strategy hour with our team and a 90-day roadmap built from this report.${plan ? "" : " Reply to this email and we'll set it up."}</p>
  ${plan ? btn(plan, "Get the strategy hour and roadmap ($500)") : ""}
  <p style="margin:12px 0 0">Interested in ongoing support or consulting services? <a href="${esc(consult)}">Talk with our team</a>.</p>
</div>`;
}

/** The names of the six areas, in the order the page shows them. */
const AREA_ORDER = ["mission", "ask", "platform", "relationships", "board", "leaders"];

/**
 * The instant email with a person's own scores, sent when they finish the scorecard. It is a sales email as well as
 * a copy of their results, so it carries the unsubscribe link and postal address like every follow-up.
 */
export function buildResultsEmail(c: Contact): { subject: string; html: string } {
  const scores = c.scores || {};
  const rows = AREA_ORDER.map((k) => {
    const v = scores[k];
    const label = v === "not sure" || v == null || v === "" ? "Not sure" : `${esc(v)}/5`;
    return `<tr><td style="padding:6px 12px 6px 0">${esc(AREA[k][0])}</td><td style="padding:6px 0;font-weight:600;text-align:right">${label}</td></tr>`;
  }).join("");
  const k = weakest(c);
  const [lowName, lowFix] = (k && AREA[k]) || ["", ""];
  const pitch = c.pitch_score !== "" && c.pitch_score != null ? ` · Pitch score ${esc(c.pitch_score)}/100` : "";
  return {
    subject: `Your fundraising scorecard results${c.org ? `: ${c.org}` : ""}`,
    html: wrap(
      p(`Hi ${esc(first(c))},`) +
        p(`Thanks for taking the WGC Fundraising Scorecard${c.org ? ` for ${esc(c.org)}` : ""}. Here are your results.`) +
        `<p style="margin:0 0 6px;font-size:17px"><b>Fundraising score ${esc(c.fundraising_score ?? "?")}/100</b>${pitch}</p>` +
        `<table style="border-collapse:collapse;margin:0 0 16px;min-width:260px">${rows}</table>` +
        (k ? p(`<b>Where to start: ${esc(lowName)}.</b> ${esc(lowFix)}`) : "") +
        p(`The full written report goes further. It covers what to fix first in all six areas, a rewritten opening for your pitch, and the next three moves for your board and your leadership. It's $100 and arrives within minutes of checkout.`) +
        btn(buyLink(c), "Get the full report ($100)") +
        sig +
        footer(c)
    ),
  };
}

interface Step {
  id: string;
  days: number;
  build: (c: Contact) => { subject: string; html: string };
}

export const SEQUENCES: { lead: Step[]; buyer: Step[] } = {
  lead: [
    {
      id: "L1",
      days: 1,
      build: (c) => {
        const k = weakest(c);
        const [name, fix] = (k && AREA[k]) || ["", ""];
        return {
          subject: `Your scorecard: where ${c.org || "you"} should start`,
          html: wrap(
            p(`Hi ${esc(first(c))},`) +
              p(
                `Thanks for taking the WGC Fundraising Scorecard${c.org ? ` for ${esc(c.org)}` : ""}.` +
                  (k ? ` Your lowest area was ${esc(name)} at ${esc((c.scores || {})[k])} out of 5, and that's usually where a little work pays back fastest.` : "")
              ) +
              (k ? p(`The short version of the fix: ${esc(fix)}`) : "") +
              p(`The full written report goes further. It covers what to fix first in all six areas, a rewritten opening for your pitch, and the next three moves for your board and your leadership. It's $100 and arrives within minutes of checkout.`) +
              btn(buyLink(c), "Get the full report ($100)") +
              sig +
              footer(c)
          ),
        };
      },
    },
    {
      id: "L2",
      days: 4,
      build: (c) => ({
        subject: `Has your board seen the scorecard?`,
        html: wrap(
          p(`Hi ${esc(first(c))},`) +
            p(`Your own scores are one view of ${esc(c.org || "your organization")}. Your board sees it from a different seat, and the gaps between your answers and theirs usually show where the next gift is stuck.`) +
            p(`You can send them the scorecard from your results page. It takes them about 10 minutes, and only the link is shared, never your answers.`) +
            p(`If you want the written plan in the meantime, your report is still waiting.`) +
            btn(buyLink(c), "Get the full report ($100)") +
            sig +
            footer(c)
        ),
      }),
    },
    {
      id: "L3",
      days: 10,
      build: (c) => ({
        subject: `One last note on your scorecard`,
        html: wrap(
          p(`Hi ${esc(first(c))},`) +
            p(`This is our last note about your scorecard. If now isn't the time, no problem at all.`) +
            p(`When you're ready, the full report turns your answers into a plan: what to fix first, a stronger ask, and specific moves for your board and leadership.`) +
            btn(buyLink(c), "Get the full report ($100)") +
            sig +
            footer(c)
        ),
      }),
    },
  ],
  buyer: [
    {
      id: "P1",
      days: 2,
      build: (c) => ({
        subject: `Putting your report to work`,
        html: wrap(
          p(`Hi ${esc(first(c))},`) +
            p(`By now you've had a couple of days with your report. Most leaders read it, agree with it, and then the week fills up.`) +
            p(`The $500 plan is for making sure it doesn't sit. You get a strategy hour with our team and a 90-day roadmap built from your report, with the ask, the board work and the donor visits in order.`) +
            (scorecardConfig().plan ? btn(scorecardConfig().plan, "Get the strategy hour and roadmap ($500)") : p(`Reply to this email and we'll get it scheduled.`)) +
            sig +
            footer(c)
        ),
      }),
    },
    {
      id: "P2",
      days: 6,
      build: (c) => ({
        subject: `Ongoing support for ${c.org || "your team"}`,
        html: wrap(
          p(`Hi ${esc(first(c))},`) +
            p(`Some organizations want more than a plan. They want someone alongside them: board and executive coaching, help preparing asks, someone to present at events, and a donor strategy that holds up all year.`) +
            p(`That's what our consulting partnerships are for. If that's where ${esc(c.org || "you")} is headed, let's talk.`) +
            btn(scorecardConfig().consult, "Talk with our team about ongoing support") +
            sig +
            footer(c)
        ),
      }),
    },
    {
      id: "P3",
      days: 14,
      build: (c) => ({
        subject: `How's the ask coming?`,
        html: wrap(
          p(`Hi ${esc(first(c))},`) +
            p(`Two weeks since your report. Did you get a chance to try the new opening for your pitch? Just hit reply and tell us how it went. We read every answer.`) +
            sig +
            footer(c)
        ),
      }),
    },
  ],
};
