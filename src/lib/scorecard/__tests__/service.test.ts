import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Contact } from "../types";

// An in-memory stand-in for the database store, with the same behavior the real one promises.
const db = vi.hoisted(() => ({ contacts: new Map<string, Contact>(), used: new Map<string, string>(), n: 0 }));
vi.mock("../store", () => ({
  getContact: async (id: string) => (db.contacts.get(id) ? structuredClone(db.contacts.get(id)!) : null),
  findContactByEmail: async (email: string) => [...db.contacts.values()].find((c) => c.email === email.toLowerCase().trim()) ?? null,
  listContacts: async () => [...db.contacts.values()].map((c) => structuredClone(c)),
  updateContact: async (id: string, fn: (c: Contact) => unknown) => {
    const c = db.contacts.get(id);
    return c ? fn(c) : null;
  },
  upsertContactByEmail: async (email: string, fn: (c: Contact, isNew: boolean) => unknown) => {
    const key = email.toLowerCase().trim();
    let c = [...db.contacts.values()].find((x) => x.email === key);
    const isNew = !c;
    if (!c) {
      c = { id: `c${++db.n}`, email: key, created_at: Date.now(), sent: {} };
      db.contacts.set(c.id, c);
    }
    return { id: c.id, result: fn(c, isNew) };
  },
  transferUsedBy: async (t: string) => db.used.get(t) ?? null,
  claimTransfer: async (t: string, id: string) => {
    const owner = db.used.get(t);
    if (owner && owner !== id) return false;
    db.used.set(t, id);
    return true;
  },
}));

const mail = vi.hoisted(() => ({ sent: [] as Array<{ to: string; subject: string; html: string }>, fail: false }));
vi.mock("../mailer", () => ({
  sendScorecardMail: async (m: { to: string; subject: string; html: string }) => {
    if (mail.fail) throw new Error("smtp down");
    mail.sent.push(m);
  },
}));
const report = vi.hoisted(() => ({ fail: false }));
vi.mock("../report", () => ({
  writeReport: async () => {
    if (report.fail) throw new Error("model down");
    return { opening: "o", areas: [], ask: {}, board_moves: [] };
  },
  renderReportEmail: () => "<p>report</p>",
}));
const verify = vi.hoisted(() => ({ result: { ok: true } as { ok: boolean; reason?: string } }));
vi.mock("../verifyTransfer", () => ({ verifyTransfer: async () => verify.result }));
// Background work runs now, so a test can see its result.
vi.mock("@/lib/runAfterResponse", () => ({ runAfterResponse: (work: () => Promise<unknown>) => void work() }));

import { handleAdminSend, handlePurchase, handleSubmit as submitWithEmail, handleUnsubscribe, runFollowups, sendResultsEmail } from "../service";
import { sign } from "../config";

const flush = () => new Promise((r) => setTimeout(r, 0));
// Most tests are about other things, so they save a lead without the instant results email; its own tests use submitWithEmail.
const handleSubmit = (body: unknown) => submitWithEmail(body, { allowResultsEmail: false });
const lead = { form: "scorecard-lead", fields: { name: "Ada Lovelace", email: "Ada@Church.test", organization: "Grace", answers_json: "{}", scores_json: '{"board":2,"ask":4}' } };

beforeEach(() => {
  db.contacts.clear();
  db.used.clear();
  db.n = 0;
  mail.sent.length = 0;
  mail.fail = false;
  report.fail = false;
  verify.result = { ok: true };
  Object.assign(process.env, { SCORECARD_SECRET: "s".repeat(40), SCORECARD_MAIL_POSTAL_ADDRESS: "1 Main St, Kansas City, MO", SCORECARD_SITE_URL: "https://fund.test" });
  delete process.env.SCORECARD_WEBHOOK_URL;
});

describe("submitting a lead", () => {
  it("saves one contact per email and updates it when they retake the scorecard", async () => {
    const a = (await handleSubmit(lead)) as { json: { ok: boolean; id: string } };
    const b = (await handleSubmit({ ...lead, fields: { ...lead.fields, organization: "Grace 2" } })) as { json: { id: string } };
    expect(a.json.ok).toBe(true);
    expect(b.json.id).toBe(a.json.id);
    expect(db.contacts.size).toBe(1);
    expect([...db.contacts.values()][0]).toMatchObject({ email: "ada@church.test", org: "Grace 2", name: "Ada Lovelace" });
  });

  it("refuses an unknown form or a missing email", async () => {
    expect((await handleSubmit({ form: "nope", fields: {} })).status).toBe(400);
    expect((await handleSubmit({ form: "scorecard-lead", fields: { name: "x", email: "bad" } })).status).toBe(400);
  });
});

describe("buying the report", () => {
  const start = async () => ((await handleSubmit(lead)) as { json: { id: string } }).json.id;

  it("confirms the payment, claims the transfer and sends the report", async () => {
    const id = await start();
    const res = (await handlePurchase({ lead_id: id, transfer_id: "TRabcdefghij1", fields: {} })) as { json: { status: string } };
    expect(res.json.status).toBe("sending");
    await flush();
    expect(db.contacts.get(id)!.purchase!.status).toBe("sent");
    expect(db.used.get("TRabcdefghij1")).toBe(id);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0].to).toBe("ada@church.test");
  });

  it("holds the report, and sends none, when the payment cannot be confirmed", async () => {
    verify.result = { ok: false, reason: "state_PENDING" };
    const id = await start();
    const res = (await handlePurchase({ lead_id: id, transfer_id: "TRabcdefghij1", fields: {} })) as { json: { status: string } };
    expect(res.json.status).toBe("pending");
    await flush();
    expect(mail.sent).toHaveLength(0);
    expect(db.contacts.get(id)!.purchase).toMatchObject({ status: "pending", reason: "state_PENDING" });
  });

  it("never lets one payment buy two reports", async () => {
    const id = await start();
    db.used.set("TRabcdefghij1", "someone-else");
    const res = (await handlePurchase({ lead_id: id, transfer_id: "TRabcdefghij1", fields: {} })) as { json: { status: string } };
    expect(res.json.status).toBe("pending");
    await flush();
    expect(mail.sent).toHaveLength(0);
    expect(db.contacts.get(id)!.purchase!.reason).toBe("transfer_already_used");
  });

  it("does not send twice when the success page is opened again", async () => {
    const id = await start();
    await handlePurchase({ lead_id: id, transfer_id: "TRabcdefghij1", fields: {} });
    await flush();
    await handlePurchase({ lead_id: id, transfer_id: "TRabcdefghij1", fields: {} });
    await flush();
    expect(mail.sent).toHaveLength(1);
  });

  it("marks the purchase failed, so it can be retried by hand, when the report cannot be written", async () => {
    report.fail = true;
    const id = await start();
    await handlePurchase({ lead_id: id, transfer_id: "TRabcdefghij1", fields: {} });
    await flush();
    expect(db.contacts.get(id)!.purchase).toMatchObject({ status: "failed", reason: "model down" });
    expect(mail.sent).toHaveLength(0);
  });

  it("asks for the email when the scorecard is unknown", async () => {
    expect((await handlePurchase({ lead_id: "nope", transfer_id: "", fields: {} })).status).toBe(400);
  });

  it("starts a contact from the success page when it has the email", async () => {
    const res = (await handlePurchase({ lead_id: "", transfer_id: "TRabcdefghij1", fields: { email: "new@x.co", name: "New" } })) as { json: { email: string } };
    expect(res.json.email).toBe("new@x.co");
    expect(db.contacts.size).toBe(1);
  });
});

describe("the admin send link", () => {
  it("refuses a link that is not signed, and every link when there is no secret", async () => {
    const id = ((await handleSubmit(lead)) as { json: { id: string } }).json.id;
    expect((await handleAdminSend({ id, t: "wrong", method: "GET" })).status).toBe(403);
    delete process.env.SCORECARD_SECRET;
    expect((await handleAdminSend({ id, t: sign(`admin:${id}`), method: "GET" })).status).toBe(403);
    process.env.SCORECARD_SECRET = "short";
    expect(sign("x")).toBeNull();
  });

  it("shows a confirm button on GET, and only POST sends the report", async () => {
    const id = ((await handleSubmit(lead)) as { json: { id: string } }).json.id;
    verify.result = { ok: false, reason: "no_transfer_id" };
    await handlePurchase({ lead_id: id, transfer_id: "", fields: {} }); // no transfer id: held for a person to check
    const t = sign(`admin:${id}`);
    const page = (await handleAdminSend({ id, t, method: "GET" })) as { html: string };
    expect(page.html).toContain("Send the $100 report?");
    expect(mail.sent).toHaveLength(0);
    await handleAdminSend({ id, t, method: "POST" });
    await flush();
    expect(mail.sent).toHaveLength(1);
    expect(db.contacts.get(id)!.purchase!.status).toBe("sent");
  });
});

describe("unsubscribing", () => {
  it("needs the signed link, then stops the follow-ups", async () => {
    const id = ((await handleSubmit(lead)) as { json: { id: string } }).json.id;
    expect((await handleUnsubscribe({ id, t: "wrong" })).status).toBe(403);
    expect((await handleUnsubscribe({ id, t: sign(id) })).status).toBe(200);
    expect(db.contacts.get(id)!.unsubscribed_at).toBeGreaterThan(0);
  });
});

describe("the follow-up run", () => {
  const DAY = 86_400_000;
  const aged = async (days: number, over: Partial<Contact> = {}) => {
    const id = ((await handleSubmit(lead)) as { json: { id: string } }).json.id;
    Object.assign(db.contacts.get(id)!, { created_at: Date.now() - days * DAY, ...over });
    return id;
  };

  it("sends the day-1 note with an unsubscribe link and the postal address, once", async () => {
    const id = await aged(2);
    expect(await runFollowups()).toHaveLength(1);
    expect(mail.sent[0].html).toContain("/api/scorecard/unsubscribe?id=");
    expect(mail.sent[0].html).toContain("1 Main St, Kansas City, MO");
    expect(db.contacts.get(id)!.sent.L1).toBeGreaterThan(0);
    expect(await runFollowups()).toHaveLength(0);
  });

  it("sends nothing before the day, to the unsubscribed, to invited board members, or twice within two days", async () => {
    await aged(0.5);
    expect(await runFollowups()).toHaveLength(0);
    db.contacts.clear();
    await aged(20, { unsubscribed_at: Date.now() });
    expect(await runFollowups()).toHaveLength(0);
    db.contacts.clear();
    await aged(20, { invited_as: "board" });
    expect(await runFollowups()).toHaveLength(0);
    db.contacts.clear();
    await aged(20, { sent: { L1: Date.now() - DAY } });
    expect(await runFollowups()).toHaveLength(0);
  });

  it("sends no marketing email without a postal address or without a secret", async () => {
    await aged(2);
    delete process.env.SCORECARD_MAIL_POSTAL_ADDRESS;
    expect(await runFollowups()).toHaveLength(0);
    process.env.SCORECARD_MAIL_POSTAL_ADDRESS = "1 Main St";
    delete process.env.SCORECARD_SECRET;
    expect(await runFollowups()).toHaveLength(0);
    expect(mail.sent).toHaveLength(0);
  });

  it("moves buyers to their own sequence", async () => {
    const id = await aged(30);
    db.contacts.get(id)!.purchase = { started_at: Date.now() - 4 * DAY, transfer_id: "TRabcdefghij1", status: "sent", sent_at: Date.now() - 3 * DAY };
    await runFollowups();
    expect(db.contacts.get(id)!.sent.P1).toBeGreaterThan(0);
    expect(db.contacts.get(id)!.sent.L1).toBeUndefined();
  });

  it("does not mark a follow-up sent when the email fails", async () => {
    const id = await aged(2);
    mail.fail = true;
    expect(await runFollowups()).toHaveLength(0);
    expect(db.contacts.get(id)!.sent.L1).toBeUndefined();
  });
});

describe("the instant results email", () => {
  const scored = { ...lead, fields: { ...lead.fields, scores_json: '{"mission":4,"ask":2,"platform":3,"relationships":5,"board":1,"leaders":"not sure"}', fundraising_score: "57", pitch_score: "74" } };

  it("is sent when someone scores, with their scores, where to start, the link back and the unsubscribe link and address", async () => {
    await submitWithEmail(scored);
    await flush();
    expect(mail.sent).toHaveLength(1);
    const m = mail.sent[0];
    expect(m.to).toBe("ada@church.test");
    expect(m.subject).toContain("Your fundraising scorecard results: Grace");
    expect(m.html).toContain("Fundraising score 57/100");
    expect(m.html).toContain("Pitch score 74/100");
    expect(m.html).toContain("Not sure");
    expect(m.html).toContain("Where to start: Board");
    expect(m.html).toMatch(/fund\.test\/\?lead=c1#report/);
    expect(m.html).toContain("/api/scorecard/unsubscribe?id=");
    expect(m.html).toContain("1 Main St, Kansas City, MO");
  });

  it("is sent once a day to one address, not again for each retake", async () => {
    await submitWithEmail(scored);
    await flush();
    await submitWithEmail(scored);
    await flush();
    expect(mail.sent).toHaveLength(1);
    // a day later it may go again
    [...db.contacts.values()][0].results_sent_at = Date.now() - 25 * 3600_000;
    await submitWithEmail(scored);
    await flush();
    expect(mail.sent).toHaveLength(2);
  });

  it("is not sent when the limit for emails says no, to board or team members, or to anyone who unsubscribed", async () => {
    await submitWithEmail(scored, { allowResultsEmail: false });
    await submitWithEmail({ ...scored, fields: { ...scored.fields, email: "board@church.test", invited_as: "board" } });
    await submitWithEmail({ ...scored, fields: { ...scored.fields, email: "team@church.test", invited_as: "team" } });
    await flush();
    expect(mail.sent).toHaveLength(0);
    const id = [...db.contacts.values()].find((c) => c.email === "ada@church.test")!.id;
    db.contacts.get(id)!.unsubscribed_at = Date.now();
    expect(await sendResultsEmail(id)).toBe("skipped");
  });

  it("is not sent without the secret or the postal address (it is a sales email), and the page still works", async () => {
    delete process.env.SCORECARD_MAIL_POSTAL_ADDRESS;
    const res = (await submitWithEmail(scored)) as { status: number };
    await flush();
    expect(res.status).toBe(200);
    expect(mail.sent).toHaveLength(0);
    process.env.SCORECARD_MAIL_POSTAL_ADDRESS = "1 Main St, Kansas City, MO";
    delete process.env.SCORECARD_SECRET;
    await submitWithEmail({ ...scored, fields: { ...scored.fields, email: "other@church.test" } });
    await flush();
    expect(mail.sent).toHaveLength(0);
  });

  it("never fails or delays the page when the email can't be sent, and lets a later try go out", async () => {
    mail.fail = true;
    const res = (await submitWithEmail(scored)) as { status: number; json: { ok: boolean } };
    await flush();
    expect(res.status).toBe(200);
    expect(res.json.ok).toBe(true);
    expect([...db.contacts.values()][0].results_sent_at).toBeUndefined();
    mail.fail = false;
    expect(await sendResultsEmail([...db.contacts.values()][0].id)).toBe("sent");
  });

  it("does not send twice when two submits arrive together", async () => {
    await Promise.all([submitWithEmail(scored), submitWithEmail(scored)]);
    await flush();
    expect(mail.sent).toHaveLength(1);
  });
});
