/**
 * Invoice payment-reminder SMS — HARD-DISABLED.
 *
 * This is not an authentication message, so it must never send through
 * src/lib/sms/authSmsSender.ts (our only Twilio campaign is approved for
 * 2FA traffic specifically). There is currently no separate, approved
 * non-authentication Twilio number/campaign for this to use either (see
 * src/lib/sms/sendText.ts's own comment on TWILIO_DONOR_FROM_NUMBER being
 * deliberately unset). Until one exists, this always no-ops — a technical
 * guarantee, not just the pre-existing INVOICE_SMS_REMINDERS_ENABLED flag,
 * which alone wouldn't stop this from riding the 2FA sender if someone
 * later "fixed" it to call a real sender without knowing the campaign
 * restriction. Signature kept identical to the previous implementation so
 * every call site continues to work unchanged.
 */
export async function sendInvoiceReminderSms(_invoiceId: string, _token: string, _reminderType: string): Promise<{ attempted: boolean; success: boolean }> {
  return { attempted: false, success: false };
}
