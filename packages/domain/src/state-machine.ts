import { PaymentStatus, paymentStatuses } from "@oya/contracts";

export const ALLOWED_TRANSITIONS: Record<
  PaymentStatus,
  readonly PaymentStatus[]
> = {
  CREATED: ["AWAITING_PAYMENT"],
  AWAITING_PAYMENT: ["CONFIRMING", "EXPIRED", "WRONG_NETWORK_FLAGGED"],
  CONFIRMING: [
    "CONFIRMING",
    "PAID",
    "UNDERPAID",
    "OVERPAID",
    "WRONG_NETWORK_FLAGGED",
    "FAILED",
  ],
  UNDERPAID: ["CONFIRMING", "EXPIRED", "REFUNDED"],
  OVERPAID: ["PAID", "REFUNDED"],
  PAID: ["PAYOUT_PENDING", "REFUNDED"],
  PAYOUT_PENDING: ["SETTLED", "FAILED"],
  SETTLED: [],
  EXPIRED: [],
  WRONG_NETWORK_FLAGGED: [],
  REFUNDED: [],
  FAILED: [],
};

export interface StateTransitionResult {
  from: PaymentStatus;
  to: PaymentStatus;
  reason: string;
  timestamp: Date;
}

export function canTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  const allowed = ALLOWED_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

export function transitionPayment(
  currentStatus: PaymentStatus,
  nextStatus: PaymentStatus,
  reason: string,
): StateTransitionResult  {
  if (!canTransition(currentStatus, nextStatus)) {
    throw new Error(
      `Invalid payment transition: cannot move from ${currentStatus} to ${nextStatus}`,
    );
  }

  return {
    from: currentStatus,
    to: nextStatus,
    reason: reason,
    timestamp: new Date(),
  };
}
