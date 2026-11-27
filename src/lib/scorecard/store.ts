import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { Contact } from "./types";

type Row = { id: string; email: string; dataJson: Prisma.JsonValue };

const asContact = (row: Row): Contact => ({ ...(row.dataJson as unknown as Omit<Contact, "id" | "email">), id: row.id, email: row.email });
const toJson = (c: Contact): Prisma.InputJsonValue => {
  const { id: _id, email: _email, ...rest } = c;
  void _id;
  void _email;
  return rest as unknown as Prisma.InputJsonValue;
};

export async function getContact(id: string): Promise<Contact | null> {
  if (!id) return null;
  const row = await prisma.scorecardContact.findUnique({ where: { id } });
  return row ? asContact(row) : null;
}

export async function findContactByEmail(email: string): Promise<Contact | null> {
  const row = await prisma.scorecardContact.findUnique({ where: { email: email.toLowerCase().trim() } });
  return row ? asContact(row) : null;
}

/** Up to `limit` contacts, for the follow-up run. */
export async function listContacts(limit = 5000): Promise<Contact[]> {
  const rows = await prisma.scorecardContact.findMany({ orderBy: { createdAt: "asc" }, take: limit });
  return rows.map(asContact);
}

/**
 * Reads one contact under a row lock, lets `change` edit it, and saves it, so two requests for the same
 * person (a double click, a retry) cannot overwrite each other. Returns what `change` returns.
 */
export async function updateContact<T>(id: string, change: (c: Contact) => T): Promise<T | null> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ScorecardContact" WHERE id = ${id} FOR UPDATE`;
    const row = await tx.scorecardContact.findUnique({ where: { id } });
    if (!row) return null;
    const c = asContact(row);
    const out = change(c);
    await tx.scorecardContact.update({ where: { id }, data: { dataJson: toJson(c) } });
    return out;
  });
}

/** Finds the contact for an email or creates it, then lets `change` edit it. One contact per email. */
export async function upsertContactByEmail<T>(email: string, change: (c: Contact, isNew: boolean) => T): Promise<{ id: string; result: T }> {
  const key = email.toLowerCase().trim();
  for (let attempt = 0; attempt < 3; attempt++) {
    const existing = await prisma.scorecardContact.findUnique({ where: { email: key } });
    if (existing) {
      const result = await updateContact(existing.id, (c) => change(c, false));
      return { id: existing.id, result: result as T };
    }
    try {
      const fresh: Contact = { id: "", email: key, created_at: Date.now(), sent: {} };
      const result = change(fresh, true);
      const row = await prisma.scorecardContact.create({ data: { email: key, dataJson: toJson({ ...fresh, email: key }) } });
      return { id: row.id, result };
    } catch (err) {
      // Someone created the same email a moment ago: go round again and update theirs.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
  }
  throw new Error("Could not save the contact");
}

/** Who paid with this transfer, or null if no one has. */
export async function transferUsedBy(transferId: string): Promise<string | null> {
  if (!transferId) return null;
  const row = await prisma.scorecardUsedTransfer.findUnique({ where: { transferId } });
  return row?.contactId ?? null;
}

/** Marks a transfer as spent on this contact. False if it already paid for someone else. */
export async function claimTransfer(transferId: string, contactId: string): Promise<boolean> {
  try {
    await prisma.scorecardUsedTransfer.create({ data: { transferId, contactId } });
    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return (await transferUsedBy(transferId)) === contactId;
    }
    throw err;
  }
}
