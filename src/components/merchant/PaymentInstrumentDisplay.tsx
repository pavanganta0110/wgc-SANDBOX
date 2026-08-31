import { Landmark } from "lucide-react";

/**
 * Plain neutral icon — no card-network branding/color. Just distinguishes
 * "a card/wallet" from "a bank account" at a glance.
 */
export function InstrumentIcon({
  paymentMethodType,
}: {
  paymentMethodType?: string | null;
}) {
  if ((paymentMethodType || "").toUpperCase() === "BANK_ACCOUNT") {
    return <Landmark className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
  }
  return null;
}

/** "Card"/"Bank Account"/"Apple Pay"/"Google Pay" — same vocabulary as the giving-link attempts table's describeInstrumentType(). */
export function describeInstrumentKind(paymentMethodType: string | null | undefined): string {
  const t = (paymentMethodType || "").toUpperCase();
  if (t === "PAYMENT_CARD") return "Card";
  if (t === "BANK_ACCOUNT") return "Bank Account";
  if (t === "APPLE_PAY") return "Apple Pay";
  if (t === "GOOGLE_PAY") return "Google Pay";
  return "Unknown";
}

/** DEBIT/CREDIT/PREPAID → title case. Real Finix field (card_type) — never guessed. */
export function describeCardType(cardType: string | null | undefined): string | null {
  if (!cardType) return null;
  const t = cardType.toUpperCase();
  if (t === "DEBIT") return "Debit";
  if (t === "CREDIT") return "Credit";
  if (t === "PREPAID") return "Prepaid";
  return null;
}

/** Masked number + cardholder name, with the brand/wallet icon — the "Payment Instrument" column. */
export function PaymentInstrumentCell({
  cardBrand,
  paymentMethodType,
  last4,
  holderName,
}: {
  cardBrand?: string | null;
  paymentMethodType?: string | null;
  last4?: string | null;
  holderName?: string | null;
}) {
  if (!last4) return <span className="text-slate-400">—</span>;
  return (
    <div className="flex items-center gap-2">
      <InstrumentIcon paymentMethodType={paymentMethodType} />
      <div>
        <p className="text-slate-700">
          {cardBrand ? `${cardBrand} ` : ""}••••{last4}
        </p>
        {holderName && <p className="text-xs text-slate-400">{holderName}</p>}
      </div>
    </div>
  );
}

/** "Card" / "Debit" two-line display — the "Instrument Type" column. */
export function InstrumentTypeCell({
  paymentMethodType,
  cardType,
}: {
  paymentMethodType?: string | null;
  cardType?: string | null;
}) {
  const kind = describeInstrumentKind(paymentMethodType);
  const typeLabel = describeCardType(cardType);
  return (
    <div>
      <p className="text-slate-700">{kind}</p>
      {typeLabel && <p className="text-xs text-slate-400">{typeLabel}</p>}
    </div>
  );
}
