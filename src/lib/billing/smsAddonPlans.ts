export interface SmsAddonPlan {
  code: "SMS_STARTER" | "SMS_GROWTH";
  name: string;
  monthlyAmountCents: number;
  includedTexts: number;
  overageRateCents: number;
}

export const SMS_ADDON_PLANS: Record<SmsAddonPlan["code"], SmsAddonPlan> = {
  SMS_STARTER: { code: "SMS_STARTER", name: "Text Messaging — Starter", monthlyAmountCents: 1500, includedTexts: 300, overageRateCents: 8 },
  SMS_GROWTH: { code: "SMS_GROWTH", name: "Text Messaging — Growth", monthlyAmountCents: 2500, includedTexts: 500, overageRateCents: 8 },
};

export function getSmsAddonPlan(code: string): SmsAddonPlan | null {
  return code === "SMS_STARTER" || code === "SMS_GROWTH" ? SMS_ADDON_PLANS[code] : null;
}
