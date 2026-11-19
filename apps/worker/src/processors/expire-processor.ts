import type { PaymentStatus } from "@oya/contracts";
import { evaluatePaymentTiming } from "@oya/domain/src/expiry.js";
import { transitionPayment } from "@oya/domain/src/state-machine.js";
import type { Clock } from "./clock.js";
import type { StatusNotifier } from "./status-notifier.js";
import type { ExpireTransactionRunner } from "./expire-transaction.js";

const EXPIRABLE_STATUSES = ["AWAITING_PAYMENT", "UNDERPAID"] as const;

const RATE_LOCK_EXPIRED_REASON = "rate_lock_expired";
const TOP_UP_GRACE_EXPIRED_REASON = "top_up_grace_expired";

export interface ExpireProcessorOptions {
  transactions: ExpireTransactionRunner;
  clock: Clock;
  statusNotifier: StatusNotifier;
}

export class ExpireProcessor {
  private readonly transactions: ExpireTransactionRunner;
  private readonly clock: Clock;
  private readonly statusNotifier: StatusNotifier;

  constructor(options: ExpireProcessorOptions) {
    this.transactions = options.transactions;
    this.clock = options.clock;
    this.statusNotifier = options.statusNotifier;
  }

  async expireOnce(): Promise<void> {
    const now = this.clock.now();
    const candidates = await this.transactions.findPaymentsByStatuses(
      EXPIRABLE_STATUSES,
    );

    for (const candidate of candidates) {
      const changed = await this.transactions.run(async (transaction) => {
        const payment = await transaction.findPayment(candidate.id);

        if (payment === null) {
          return false;
        }

        const status = payment.status;

        if (status !== "AWAITING_PAYMENT" && status !== "UNDERPAID") {
          return false;
        }

        const decision = evaluatePaymentTiming(payment.createdAt, now);

        if (!shouldExpire(status, decision)) {
          return false;
        }

        const transition = transitionPayment(
          status,
          "EXPIRED",
          reasonFor(status),
        );

        await transaction.updatePaymentStatus(payment.id, transition.to);
        await transaction.insertAuditEvent({
          paymentId: payment.id,
          fromStatus: transition.from,
          toStatus: transition.to,
          reason: transition.reason,
          txHash: null,
          createdAt: now,
        });
        return true;
      });
      if (changed) {
        await this.statusNotifier.notifyPaymentStatus(candidate.id);
      }
    }
  }
}

type TimingDecision = ReturnType<typeof evaluatePaymentTiming>;

function shouldExpire(
  status: PaymentStatus,
  decision: TimingDecision,
): boolean {
  if (status === "AWAITING_PAYMENT") {
    return decision !== "VALID_RATE_WINDOW";
  }

  if (status === "UNDERPAID") {
    return decision === "EXPIRED";
  }

  return false;
}

function reasonFor(status: "AWAITING_PAYMENT" | "UNDERPAID"): string {
  return status === "AWAITING_PAYMENT"
    ? RATE_LOCK_EXPIRED_REASON
    : TOP_UP_GRACE_EXPIRED_REASON;
}
