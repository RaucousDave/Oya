import type { ChainAdapter } from "@oya/chain";
import type { PaymentStatus } from "@oya/contracts";
import { comparePaymentAmounts } from "@oya/domain/src/money.js";
import { transitionPayment } from "@oya/domain/src/state-machine.js";
import type { Clock } from "./clock.js";
import type {
  ConfirmableChainTx,
  ConfirmTransactionRunner,
} from "./confirm-transaction.js";

export const CONFIRMATIONS_REQUIRED = 2;

const AMOUNT_EXACT_REASON = "amount_exact";
const AMOUNT_UNDERPAID_REASON = "amount_underpaid";
const AMOUNT_OVERPAID_REASON = "amount_overpaid";
const TOP_UP_CONFIRMED_REASON = "top_up_confirmed";

type ConfirmedStatus = "PAID" | "UNDERPAID" | "OVERPAID";

export interface ConfirmProcessorOptions {
  chain: Pick<ChainAdapter, "getLatestBlock">;
  transactions: ConfirmTransactionRunner;
  clock: Clock;
  requiredConfirmations?: number;
}

function computeConfirmations(
  latestBlock: bigint,
  blockNumber: bigint,
): number {
  if (blockNumber > latestBlock) {
    return 0;
  }

  const confirmations = latestBlock - blockNumber + 1n;
  const max = BigInt(Number.MAX_SAFE_INTEGER);

  return confirmations > max ? Number.MAX_SAFE_INTEGER : Number(confirmations);
}

function reasonFor(status: ConfirmedStatus): string {
  switch (status) {
    case "PAID":
      return AMOUNT_EXACT_REASON;
    case "UNDERPAID":
      return AMOUNT_UNDERPAID_REASON;
    case "OVERPAID":
      return AMOUNT_OVERPAID_REASON;
  }
}

export class ConfirmProcessor {
  private readonly chain: Pick<ChainAdapter, "getLatestBlock">;
  private readonly transactions: ConfirmTransactionRunner;
  private readonly clock: Clock;
  private readonly requiredConfirmations: number;

  constructor(options: ConfirmProcessorOptions) {
    const requiredConfirmations =
      options.requiredConfirmations ?? CONFIRMATIONS_REQUIRED;

    if (
      !Number.isInteger(requiredConfirmations) ||
      requiredConfirmations < 1
    ) {
      throw new Error("requiredConfirmations must be a positive integer");
    }

    this.chain = options.chain;
    this.transactions = options.transactions;
    this.clock = options.clock;
    this.requiredConfirmations = requiredConfirmations;
  }

  async confirmOnce(): Promise<void> {
    const latestBlock = await this.chain.getLatestBlock();
    const pending = await this.transactions.findChainTxsBelowConfirmations(
      this.requiredConfirmations,
    );

    for (const [paymentId, chainTxs] of groupByPayment(pending)) {
      await this.transactions.run(async (transaction) => {
        let reachedRequired = false;

        for (const chainTx of chainTxs) {
          const confirmations = computeConfirmations(
            latestBlock,
            chainTx.blockNumber,
          );

          await transaction.updateChainTxConfirmations(
            chainTx.txHash,
            confirmations,
          );

          if (confirmations >= this.requiredConfirmations) {
            reachedRequired = true;
          }
        }

        if (!reachedRequired) {
          return;
        }

        const payment = await transaction.findPayment(paymentId);

        if (payment === null) {
          throw new Error(`Payment not found: ${paymentId}`);
        }

        if (payment.status !== "CONFIRMING" && payment.status !== "UNDERPAID") {
          return;
        }

        const confirmedAmount = await transaction.sumConfirmedAmount(
          paymentId,
          this.requiredConfirmations,
        );
        const comparison = comparePaymentAmounts(
          payment.requiredAmount,
          confirmedAmount,
        );
        const targetStatus: ConfirmedStatus =
          comparison.status === "EXACT" ? "PAID" : comparison.status;

        let currentStatus: PaymentStatus = payment.status;

        if (currentStatus === "UNDERPAID" && targetStatus !== "UNDERPAID") {
          const topUp = transitionPayment(
            currentStatus,
            "CONFIRMING",
            TOP_UP_CONFIRMED_REASON,
          );

          await transaction.updatePaymentStatus(paymentId, topUp.to);
          await transaction.insertAuditEvent({
            paymentId,
            fromStatus: topUp.from,
            toStatus: topUp.to,
            reason: topUp.reason,
            txHash: null,
            createdAt: this.clock.now(),
          });

          currentStatus = topUp.to;
        }

        if (targetStatus === currentStatus) {
          return;
        }

        const transition = transitionPayment(
          currentStatus,
          targetStatus,
          reasonFor(targetStatus),
        );

        await transaction.updatePaymentStatus(paymentId, transition.to);

        if (targetStatus === "OVERPAID") {
          await transaction.insertLedgerEntry({
            paymentId,
            entryType: "OVERPAYMENT_SURPLUS",
            amount: comparison.difference,
            createdAt: this.clock.now(),
          });
        }

        await transaction.insertAuditEvent({
          paymentId,
          fromStatus: transition.from,
          toStatus: transition.to,
          reason: transition.reason,
          txHash: null,
          createdAt: this.clock.now(),
        });
      });
    }
  }
}

function groupByPayment(
  chainTxs: ConfirmableChainTx[],
): Map<string, ConfirmableChainTx[]> {
  const groups = new Map<string, ConfirmableChainTx[]>();

  for (const chainTx of chainTxs) {
    const group = groups.get(chainTx.paymentId);

    if (group === undefined) {
      groups.set(chainTx.paymentId, [chainTx]);
    } else {
      group.push(chainTx);
    }
  }

  return groups;
}
