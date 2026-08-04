# Invoice wallet payments — real-device manual test checklist

## Why this document exists

Apple Pay and Google Pay payment sheets are native, OS-owned UI. No browser
automation tool (Playwright included) can open them, fill them in, or
authorize a payment inside them — and neither Apple nor Google issue
reusable test tokens that a real payment processor (Finix) will accept from
an automated script. That means the actual wallet sheet — the part a real
customer taps through — has never been exercised by an automated test in
this codebase, and cannot be with the tools available.

Everything *around* the wallet sheet **is** covered by automated tests:

- `src/app/api/invoice/__tests__/invoicePayRoute.test.ts` — fee coverage
  on/off, server-side final-total calculation, backend rejection of a
  manipulated fee/total, duplicate `clientAttemptId` submission, wallet
  token routing (`third_party_token`), cross-church/sub-account scoping.
- `src/lib/invoices/__tests__/invoicePaymentReconciliation.test.ts` —
  SUCCEEDED/FAILED/CANCELED transfer-state handling, idempotent duplicate
  webhook delivery, out-of-order/stale-state protection.
- `e2e/invoiceWallet.spec.ts` (Playwright, see `e2e/helpers/walletAdapter.ts`
  and `src/lib/finix/wallets/testWalletAdapter.ts`) — the amount forwarded
  to the wallet call site matches the on-page total, a fee-coverage toggle
  rebuilds that amount on the *next* click (never a stale one), a canceled
  wallet sheet never submits a payment, a non-authentic wallet token is
  genuinely rejected end-to-end by the real Finix sandbox, a paid invoice
  never shows active wallet controls, and two churches' invoices stay
  isolated from each other.

What none of that proves: that a real iPhone/Mac Safari or Android Chrome,
talking to a real Apple/Google wallet with a real card, produces a token
Finix accepts, and that the resulting UI/receipt/PDF/statement all agree.
That's what this checklist is for. **This is a release-validation gate, not
a substitute for the automated suite above — both are required.**

## Before you start

- Use the sandbox environment (`NEXT_PUBLIC_FINIX_ENV` sandbox), a test
  church with `allowApplePay`/`allowGooglePay`/`allowFeeCoverage` all
  enabled, and an invoice with a known amount.
- Have a real Apple Pay-provisioned card on the test device/Mac, and a real
  Google Pay-provisioned card on the test Android device.
- For each row below, record every column. A blank column means "not
  tested," not "passed."

## Result columns to record, per test

| Column | What to record |
|---|---|
| Browser / device | e.g. "iPhone 15, iOS 18.2, Safari" |
| Environment | sandbox / production |
| Account / sub-account | which church, and whether it's a sub-account |
| Invoice number | |
| Invoice amount | the line-item total before any fee |
| Fee contribution | what the fee-coverage checkbox added, if on |
| Total displayed on invoice page | the number shown before tapping the wallet button |
| Total displayed in wallet sheet | the number Apple Pay / Google Pay itself shows |
| Provider transaction ID | Finix transfer ID from the success response |
| Return-page status | what the invoice page shows immediately after the sheet closes |
| Final webhook status | SUCCEEDED/FAILED as reflected once the webhook lands (check InvoicePayment.status) |
| Invoice status | DRAFT/SENT/VIEWED/PARTIALLY_PAID/PAID/etc. after the payment |
| Receipt result | did the payment receipt email arrive, with correct amounts |
| PDF/print result | does the downloaded/printed invoice show the same totals |
| Annual-statement result | (charitable-classified invoices only) does the year-end statement reflect it correctly |

**The invoice total and wallet-sheet total must match exactly, in every
row.** Any mismatch is a release blocker, not a note.

## Google Pay matrix — Android Chrome

Run each row for: Visa, Mastercard, Amex.

| # | Scenario | Result columns (see above) |
|---|---|---|
| G1 | Fee coverage off, full balance | |
| G2 | Fee coverage on, full balance | |
| G3 | Fee coverage toggled ON, then OFF, then wallet opened — sheet must reflect OFF | |
| G4 | Fee coverage toggled AFTER the wallet sheet is opened but before confirming (if the platform allows backgrounding and returning) — reopen and confirm the amount is current | |
| G5 | Successful payment, full flow to receipt | |
| G6 | Tap wallet button, then cancel from within the sheet — invoice page must return to an active, payable state | |
| G7 | Force a decline (e.g. a known-decline test card) — invoice page must show a clear failure and remain payable | |
| G8 | Simulate a delayed webhook (or observe real settlement lag) — page must resolve correctly once the webhook lands, not get stuck | |
| G9 | Refresh the invoice page immediately after a successful payment — must show PAID, not the payment form again | |

## Apple Pay matrix — iPhone Safari and Mac Safari

Run each row for: Visa, Mastercard, Amex, on both iPhone Safari and Mac
Safari (they use different code paths for merchant validation).

| # | Scenario | Result columns |
|---|---|---|
| A1 | Fee coverage off, full balance | |
| A2 | Fee coverage on, full balance | |
| A3 | Fee coverage toggled ON, then OFF, then wallet opened — sheet must reflect OFF | |
| A4 | Successful payment, full flow to receipt | |
| A5 | Tap wallet button, then cancel from within the sheet — invoice page must return to an active, payable state | |
| A6 | Force a decline (e.g. a known-decline test card) — invoice page must show a clear failure and remain payable | |
| A7 | Simulate a delayed webhook (or observe real settlement lag) — page must resolve correctly once the webhook lands | |
| A8 | Refresh the invoice page immediately after a successful payment — must show PAID, not the payment form again | |

## Cross-cutting checks (run once per platform, on any passing row above)

- [ ] PDF downloaded from the invoice page after a successful wallet
      payment shows the same invoice amount / fee contribution / total as
      the invoice page (see `src/lib/invoices/pdf/InvoicePdf.tsx`'s
      Payments section).
- [ ] Browser-printed version (Ctrl/Cmd+P from the invoice page) shows the
      same fee summary and payment history — no financial row hidden by
      print styles.
- [ ] Payment receipt email includes the invoice PDF attachment, and its
      figures match.
- [ ] Merchant dashboard invoice detail page (`/merchant/invoices/[id]`)
      shows the same payment in its payment history table.
- [ ] For a `CHARITABLE_DONATION` or `PARTIAL_DONATION`-classified invoice:
      the donor's year-end statement includes this payment with the
      correct charitable portion, excluding any fee contribution from the
      deductible amount.
- [ ] Repeat at least one full success scenario (G5 or A4) on a
      **sub-account** invoice, confirming it's scoped correctly and does
      not appear in another church's dashboard.

## Sign-off

| Tester | Date | Platforms covered | Blocking issues found | Cleared for release? |
|---|---|---|---|---|
| | | | | |
