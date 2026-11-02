# MBTS sandbox — setup runbook

How to give a prospect such as MBTS a hands-on, branded sandbox login that works as a general card
processor (phone payments, invoices, payment links) rather than a donation tool. Everything MBTS-specific
is a per-organization setting that is **off by default**, so no other organization is affected.

## 1. Create the sandbox organization

Use the normal flow in the **sandbox** environment (never production): onboard "MBTS" as a merchant and
approve it as you would any sandbox merchant, so it gets a Finix sandbox merchant id. Use Finix's published
test cards / test bank accounts for any payment made in the demo.

## 2. Add their branding

Sign in to the sandbox org (or use "View as Merchant" from the admin area) → **Settings → Branding** and set:

- Logo (HTTPS image URL / upload)
- Primary color and accent color (6-digit hex such as `#1f3a5f`)

Needed from MBTS (ask Collin): logo file and brand colors.

## 3. Turn on the MBTS settings (WGC admin)

Admin area → **Merchants → MBTS → Payment processor mode** (an admin with *Manage users* permission):

| Setting | Turn on for MBTS | What it does |
|---|---|---|
| Payment mode | Yes | Payer/payment wording instead of donor/donation/giving: dashboard, payment links, receipts, emails |
| Term field on Take a Payment | Yes | Staff can tag a prior semester on a payment |
| Branded dashboard | Yes | Their logo and colors on their own dashboard |
| Payment note on receipts | Their choice | Show the staff-entered note on the payer's receipt, the staff notification, or both |

Student fields (student ID / name on deposits and payments) come from **Student Giving**. Turn that on in the
same admin page and import their roster on the Students page if they want student ID and name in deposit detail.

## 4. Invite their tester

Admin area → **Merchants → MBTS → Users → Invite** (or Settings → Team inside the org). Invite Ezra as an
**Owner** or **Admin** (Admin needs *View settlements* to see deposits). Do not share any password in chat;
the invite email sets it.

## 5. Check before sharing

- Dashboard shows the MBTS logo and colors, and says "Payers", "Payment Links", etc.
- Take a Payment: Term field present; success screen offers **Print receipt** and **Email receipt**.
- Payments list: search box finds a payment by payer name, student ID, amount, note.
- A payment's detail panel: **Supporting Documents** can attach and download a PDF.
- Deposits → open a deposit: **Included Payments** lists every payment with student ID, name and note, the
  rows add up to the deposit total, and **Download CSV** works.
- Payment link page and the receipt email/PDF read "payment"/"payer" with no tax-deductible wording.

## Notes

- Schema changes are applied by `prisma db push` at build; the same changes are in
  `prisma/manual/add_payment_mode_settings.sql` for manual application. Apply to sandbox first.
- Supporting documents are stored in the existing private object storage (Supabase service-role credentials
  must be configured, as for external-donation proof and IRS letters). They are served only as short-lived,
  forced-download signed links, and every upload/download/removal is written to the dashboard audit log.
