/* eslint-disable @typescript-eslint/no-explicit-any -- in-memory prisma fakes */
import { describe, it, expect, vi, beforeEach } from "vitest";

let attendees: Record<string, any>[];
let registrations: Record<string, any>[];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    eventAttendee: {
      findFirst: async ({ where }: any) => attendees.find((a) => (where.ticketToken ? a.ticketToken === where.ticketToken : a.id === where.id) && (!where.churchId || a.churchId === where.churchId)) ?? null,
      updateMany: async ({ where, data }: any) => {
        const rows = attendees.filter((a) => a.id === where.id && a.churchId === where.churchId && a.checkedIn === where.checkedIn);
        rows.forEach((r) => Object.assign(r, data));
        return { count: rows.length };
      },
    },
    eventRegistration: { findFirst: async ({ where }: any) => registrations.find((r) => r.id === where.id && r.churchId === where.churchId) ?? null },
  },
}));

import { checkInByTicket, encodeTicketPayload, generateTicketToken, parseTicketPayload } from "@/lib/eventRegistration/tickets";

const TOKEN = "AbCdEfGhIjKlMnOpQrSt";

beforeEach(() => {
  attendees = [{ id: "a1", churchId: "c1", eventId: "e1", registrationId: "r1", firstName: "Pat", lastName: "Lee", ticketToken: TOKEN, checkedIn: false, checkedInAt: null }];
  registrations = [{ id: "r1", churchId: "c1", status: "CONFIRMED", groupName: "Team", confirmationCode: "ABC12345" }];
});

describe("ticket payloads", () => {
  it("round-trips the QR payload, a pasted ticket link and a bare token", () => {
    const t = generateTicketToken();
    expect(parseTicketPayload(encodeTicketPayload(t))).toBe(t);
    expect(parseTicketPayload(`https://www.wgcpayments.com/ticket/${t}`)).toBe(t);
    expect(parseTicketPayload(t)).toBe(t);
  });

  it("rejects anything that isn't plausibly a ticket", () => {
    for (const bad of ["", "   ", "hello world", "WGC-TKT:short", "https://example.com/other/path", "a".repeat(200)]) expect(parseTicketPayload(bad)).toBeNull();
  });
});

describe("checkInByTicket", () => {
  const args = { churchId: "c1", eventId: "e1", token: TOKEN, userId: "u1" };

  it("checks in once, then reports already-checked-in without changing the time", async () => {
    const first = await checkInByTicket(args);
    expect(first.outcome).toBe("CHECKED_IN");
    expect(attendees[0]).toMatchObject({ checkedIn: true, checkedInByUserId: "u1" });
    const stamp = attendees[0].checkedInAt;
    const second = await checkInByTicket(args);
    expect(second.outcome).toBe("ALREADY_CHECKED_IN");
    expect(attendees[0].checkedInAt).toBe(stamp);
  });

  it("treats another organization's ticket as unknown", async () => {
    expect((await checkInByTicket({ ...args, churchId: "other" })).outcome).toBe("NOT_FOUND");
    expect(attendees[0].checkedIn).toBe(false);
  });

  it("flags a ticket for a different event and does not check it in", async () => {
    expect((await checkInByTicket({ ...args, eventId: "e2" })).outcome).toBe("WRONG_EVENT");
    expect(attendees[0].checkedIn).toBe(false);
  });

  it("refuses tickets of unconfirmed or canceled registrations", async () => {
    for (const status of ["PENDING", "CANCELED", "PAYMENT_FAILED"]) {
      registrations[0].status = status;
      expect((await checkInByTicket(args)).outcome).toBe("NOT_CONFIRMED");
    }
    expect(attendees[0].checkedIn).toBe(false);
  });

  it("returns NOT_FOUND for an unknown token", async () => {
    expect((await checkInByTicket({ ...args, token: "ZZZZZZZZZZZZZZZZZZZZ" })).outcome).toBe("NOT_FOUND");
  });
});
