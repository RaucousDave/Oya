export const paymentStatuses = [
  "CREATED",
  "AWAITING_PAYMENT",
  "CONFIRMING",
  "UNDERPAID",
  "OVERPAID",
  "PAID",
  "PAYOUT_PENDING",
  "SETTLED",
  "EXPIRED",
  "WRONG_NETWORK_FLAGGED",
  "REFUNDED",
  "FAILED",
] as const;
export type PaymentStatus = (typeof paymentStatuses)[number];
