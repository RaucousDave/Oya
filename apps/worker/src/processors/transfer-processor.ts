import type { ChainTransfer } from "@oya/chain";
import { transitionPayment } from "@oya/domain/src/state-machine.js";
import type { Clock } from "./clock.js";
import type { TransferHandler } from "./transfer-handler.js";
import type { TransferTransactionRunner } from "./transfer-transaction.js";

const TRANSFER_RECEIVED_REASON = "transfer_received";

export class TransferProcessor implements TransferHandler {
  constructor(
    private readonly transactions: TransferTransactionRunner,
    private readonly clock: Clock,
  ) {}

  async handle(transfer: ChainTransfer): Promise<void> {
    await this.transactions.run(async (transaction) => {
      const payment = await transaction.findPaymentByDepositAddress(
        transfer.to,
      );

      if (payment === null) {
        return;
      }

      const inserted = await transaction.insertChainTxIfAbsent({
        txHash: transfer.txHash,
        paymentId: payment.id,
        blockNumber: transfer.blockNumber,
        to: transfer.to,
        amount: transfer.amount,
      });

      if (!inserted) {
        return;
      }

      const transition = transitionPayment(
        payment.status,
        "CONFIRMING",
        TRANSFER_RECEIVED_REASON,
      );

      await transaction.updatePayment(payment.id, {
        receivedAmount: payment.receivedAmount + transfer.amount,
        status: transition.to,
      });

      await transaction.insertAuditEvent({
        paymentId: payment.id,
        fromStatus: transition.from,
        toStatus: transition.to,
        reason: transition.reason,
        txHash: transfer.txHash,
        createdAt: this.clock.now(),
      });
    });
  }
}
