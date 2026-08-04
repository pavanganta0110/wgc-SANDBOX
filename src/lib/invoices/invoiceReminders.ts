import { prisma } from "@/lib/prisma";
import { canAcceptPayment, type InvoiceStatus } from "./invoiceStatus";
import { regenerateInvoicePublicToken } from "./invoicePublicToken";
import { sendInvoiceReminderEmail } from "./invoiceEmails";
import { sendInvoiceReminderSms } from "./invoiceSms";

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Schedules this invoice's reminder rows (BEFORE_DUE / ON_DUE / AFTER_DUE)
 * based on the church's InvoiceSettings, called once when an invoice is
 * actually sent (see the /send route). Idempotent — the idempotencyKey
 * (invoiceId + type + target date) means calling this again for an
 * already-scheduled invoice (e.g. a resend) is a safe no-op via
 * createMany's skipDuplicates.
 */
export async function scheduleInvoiceReminders(invoiceId: string, churchId: string) {
  const [invoice, settings] = await Promise.all([
    prisma.invoice.findUnique({ where: { id: invoiceId } }),
    prisma.invoiceSettings.findUnique({ where: { churchId } }),
  ]);
  if (!invoice) return;
  if (settings && !settings.remindersEnabledByDefault) return;

  const beforeDueDays = settings?.reminderBeforeDueDays ?? 3;
  const onDueDate = settings?.reminderOnDueDate ?? true;
  const afterDueDaysList: number[] = Array.isArray(settings?.reminderAfterDueDaysJson)
    ? (settings!.reminderAfterDueDaysJson as unknown as number[])
    : [3, 7];

  const dueDate = invoice.dueDate;
  const rows: { invoiceId: string; churchId: string; reminderType: string; scheduledFor: Date; idempotencyKey: string }[] = [];

  if (beforeDueDays > 0) {
    const scheduledFor = new Date(dueDate.getTime() - beforeDueDays * 24 * 60 * 60 * 1000);
    rows.push({ invoiceId, churchId, reminderType: "BEFORE_DUE", scheduledFor, idempotencyKey: `${invoiceId}:BEFORE_DUE:${dayKey(scheduledFor)}` });
  }
  if (onDueDate) {
    rows.push({ invoiceId, churchId, reminderType: "ON_DUE", scheduledFor: dueDate, idempotencyKey: `${invoiceId}:ON_DUE:${dayKey(dueDate)}` });
  }
  for (const days of afterDueDaysList) {
    const scheduledFor = new Date(dueDate.getTime() + days * 24 * 60 * 60 * 1000);
    rows.push({ invoiceId, churchId, reminderType: "AFTER_DUE", scheduledFor, idempotencyKey: `${invoiceId}:AFTER_DUE:${dayKey(scheduledFor)}` });
  }

  if (rows.length > 0) {
    await prisma.invoiceReminder.createMany({ data: rows, skipDuplicates: true });
  }
}

/**
 * Cron entry point (see /api/cron/invoice-reminders) — sends every
 * SCHEDULED reminder whose time has come. A reminder for an invoice that's
 * no longer eligible (paid, voided, uncollectible) is marked SKIPPED
 * rather than sent, per InvoiceReminder's own doc comment.
 *
 * Sending mints a fresh public token every time (regenerateInvoicePublicToken)
 * rather than trying to reuse the original link — this codebase never
 * persists a raw token for later reuse (see SubscriptionSetupLink's
 * send-payment-update-link route, which does the same thing for recurring
 * dunning emails), so a background job has no other way to build a working
 * link. This does mean any earlier, unused link stops working once a
 * reminder goes out — an accepted tradeoff of the single-active-token
 * design, not a bug.
 */
export async function sendDueInvoiceReminders(now: Date = new Date()) {
  const due = await prisma.invoiceReminder.findMany({
    where: { status: "SCHEDULED", scheduledFor: { lte: now } },
    take: 200,
  });

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const reminder of due) {
    const invoice = await prisma.invoice.findUnique({ where: { id: reminder.invoiceId } });
    if (!invoice || !canAcceptPayment(invoice.status as InvoiceStatus) || invoice.balanceCents <= 0) {
      await prisma.invoiceReminder.update({ where: { id: reminder.id }, data: { status: "SKIPPED" } });
      skipped++;
      continue;
    }

    try {
      const token = await regenerateInvoicePublicToken(invoice.id, invoice.churchId);
      const result = await sendInvoiceReminderEmail(invoice.id, token, reminder.reminderType);
      // Best-effort — off by default (see invoiceSms.ts), and a no-op/
      // failed SMS never blocks the (mandatory) email reminder above.
      await sendInvoiceReminderSms(invoice.id, token, reminder.reminderType).catch((err) => console.error("Failed to send invoice reminder SMS:", err));
      await prisma.invoiceReminder.update({
        where: { id: reminder.id },
        data: { status: result.success ? "SENT" : "SCHEDULED", sentAt: result.success ? now : undefined },
      });
      if (result.success) {
        sent++;
        await prisma.invoiceActivity.create({
          data: { invoiceId: invoice.id, churchId: invoice.churchId, activityType: "invoice.reminder_sent", metadata: { reminderType: reminder.reminderType } },
        });
      } else {
        failed++;
      }
    } catch (err) {
      console.error(`Failed to send invoice reminder ${reminder.id}:`, err);
      failed++;
    }
  }

  return { processed: due.length, sent, skipped, failed };
}

/**
 * Idempotency helper exposed for tests — not used at runtime (the DB's
 * @unique on idempotencyKey is the real guard); kept because the
 * date-bucketing rule (same invoice+type+day never double-schedules) is
 * exactly the kind of thing worth a direct unit test rather than only an
 * integration test against createMany.
 */
export function buildReminderIdempotencyKey(invoiceId: string, reminderType: string, scheduledFor: Date): string {
  return `${invoiceId}:${reminderType}:${dayKey(scheduledFor)}`;
}
