import { transitionPayment } from "@oya/domain/src/state-machine.js";
import type { Clock } from "./clock.js";
import type { PayoutProvider } from "./payout-provider.js";
import type { PayoutTransactionRunner } from "./payout-transaction.js";

const PAYABLE_STATUSES = ["PAID"] as const;

const PAYOUT_PENDING_REASON = "payout_started";
const SETTLED_REASON = "payout_settled";

export interface PayoutProcessorOptions {
  transactions: PayoutTransactionRunner;
  provider: PayoutProvider;
  clock: Clock;
}

export class PayoutProcessor {
  private readonly transactions: PayoutTransactionRunner;
  private readonly provider: PayoutProvider;
  private readonly clock: Clock;

  constructor(options: PayoutProcessorOptions) {
    this.transactions = options.transactions;
    this.provider = options.provider;
    this.clock = options.clock;
  }

  async payoutOnce(): Promise<void> {
    const candidates = await this.transactions.findPaymentsByStatuses(
      PAYABLE_STATUSES,
    );

    for (const candidate of candidates) {
      await this.transactions.run(async (transaction) => {
        const payment = await transaction.findPayment(candidate.id);

        if (payment === null || payment.status !== "PAID") {
          return;
        }

        const now = this.clock.now();

        const pending = transitionPayment(
          payment.status,
          "PAYOUT_PENDING",
          PAYOUT_PENDING_REASON,
        );

        await transaction.updatePaymentStatus(payment.id, pending.to);
        await transaction.insertAuditEvent({
          paymentId: payment.id,
          fromStatus: pending.from,
          toStatus: pending.to,
          reason: pending.reason,
          txHash: null,
          createdAt: now,
        });

        const result = await this.provider.createPayout({
          idempotencyKey: payment.id,
          paymentId: payment.id,
          merchantId: payment.merchantId,
          amountKobo: payment.ngnAmountKobo,
        });

        await transaction.insertPayout({
          paymentId: payment.id,
          amountKobo: payment.ngnAmountKobo,
          status: result.status,
          provider: result.provider,
          providerReference: result.providerReference,
          createdAt: now,
        });

        await transaction.insertLedgerEntry({
          paymentId: payment.id,
          entryType: "MERCHANT_BALANCE",
          amount: payment.ngnAmountKobo,
          createdAt: now,
        });
        await transaction.insertLedgerEntry({
          paymentId: payment.id,
          entryType: "PAYOUT",
          amount: payment.ngnAmountKobo,
          createdAt: now,
        });

        await transaction.insertReceipt({
          paymentId: payment.id,
          merchantId: payment.merchantId,
          ngnAmountKobo: payment.ngnAmountKobo,
          tokenAmount: payment.tokenAmount,
          rate: payment.rate,
          txHashes: [...payment.txHashes],
          createdAt: now,
        });

        const settled = transitionPayment(
          pending.to,
          "SETTLED",
          SETTLED_REASON,
        );

        await transaction.updatePaymentStatus(payment.id, settled.to);
        await transaction.insertAuditEvent({
          paymentId: payment.id,
          fromStatus: settled.from,
          toStatus: settled.to,
          reason: settled.reason,
          txHash: null,
          createdAt: now,
        });
      });
    }
  }
}
