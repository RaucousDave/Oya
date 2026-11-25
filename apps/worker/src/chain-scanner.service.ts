import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ChainAdapter } from '@oya/chain';
import {
  ChainTransactionRepository,
  db,
  PaymentRepository,
  AuditEventRepository,
} from '@oya/database';

import { transitionPayment } from '@oya/domain';
import { metadata } from 'reflect-metadata/no-conflict';

export const CHAIN_ADAPTER = Symbol('CHAIN_ADAPTER');

@Injectable()
export class ChainScannerService {
  private readonly logger = new Logger(ChainScannerService.name);

  constructor(@Inject(CHAIN_ADAPTER) private readonly chain: ChainAdapter) {}

  async checkConnection() {
    const latestBlock = await this.chain.getLatestBlock();
    this.logger.log(`This is the latest block ${latestBlock}`);

    const paymentBlock = 63013045n;
    const transfers = await this.chain.getTransfersInRange(
      paymentBlock,
      paymentBlock,
    );
    const tokenAddress = process.env.DEMO_TOKEN_ADDRESS;

    if (!tokenAddress) throw new Error('SET DEMO TOKEN ADDRESS');

    const chainId = 84532;
    const cursorKey = `${chainId}:${tokenAddress.toLowerCase()}`;

    await db.transaction(async (tx) => {
      const payments = PaymentRepository.forTransaction(tx);
      const chainTxs = new ChainTransactionRepository(tx);
      const audit = new AuditEventRepository(tx);

      for (const transfer of transfers) {
        const payment = await payments.findByDepositAddress({
          chainId: 84532,
          tokenAddress: tokenAddress,
          depositAddress: transfer.to,
        });

        if (!payment) continue;

        const current = await payments.lockPayment({ paymentId: payment.id });
        const detected = await chainTxs.insertDetected({
          paymentId: payment.id,
          txHash: transfer.hash,
          amount: transfer.value.toString(),
          blockNumber: transfer.blockNumber,
          detectedAt: new Date(),
        });

        if (!detected || current.status !== 'AWAITING_PAYMENT') continue;
        if (detected.detectedAt > current.rateExpiresAt) continue;

        const change = transitionPayment(
          current.status,
          'CONFIRMING',
          'Detected transfer to checkout address',
        );

        await payments.updatePaymentState({
          paymentId: payment.id,
          expectedVersion: current.version,
          expectedStatus: change.from,
          nextStatus: change.to,
          receivedTokenAmount: current.receivedTokenAmount,
          updatedAt: new Date(),
        });

        await audit.append({
          paymentId: payment.id,
          oldStatus: change.from,
          newStatus: change.to,
          reason: change.reason,
          createdAt: change.timestamp,
          metadata: { txHash: transfer.hash },
        });
      }

      await chainTxs.advanceCursor(cursorKey, paymentBlock);
    });

    this.logger.log(`Finished scanning block ${paymentBlock}`);
  }

  async confirmDetectedTransfer() {
    const reader = new ChainTransactionRepository(db);
    let afterId: string | undefined;

    while (true) {
      const transfers = await reader.listUnconfirmed(100, afterId);

      if (transfers.length === 0) break;

      for (const transfer of transfers) {
        afterId = transfer.id;

        if (transfer.blockNumber == null) {
          this.logger.warn(
            `No block was seen for this transaction #${transfer.id}`,
          );
          continue;
        }

        const count = Number(
          await this.chain.getConfirmations(transfer.blockNumber),
        );

        await db.transaction(async (tx) => {
          const chainTxs = new ChainTransactionRepository(tx);
          const payments = PaymentRepository.forTransaction(tx);
          const auditEvent = new AuditEventRepository(tx);

          const payment = await payments.lockPayment({
            paymentId: transfer.paymentId,
          });

          const updated = await chainTxs.recordConfirmations(
            transfer.id,
            count,
            count >= 2 ? new Date() : undefined,
          );

          if (updated.confirmedAt || payment.status !== 'CONFIRMING') return;

          const total = await chainTxs.getConfirmedTotal(payment.id);
          const received = BigInt(total);
          const required = BigInt(payment.requiredTokenAmount);

          let nextStatus: 'PAID' | 'UNDERPAID' | 'OVERPAID' = 'PAID';
          if (received > required) nextStatus = 'OVERPAID';
          if (required > received) nextStatus = 'UNDERPAID';

          const change = transitionPayment(
            payment.status,
            nextStatus,
            'Compared confirmed transfers with the checkout amount',
          );

          await payments.updatePaymentState({
            paymentId: payment.id,
            expectedVersion: payment.version,
            expectedStatus: change.from,
            nextStatus: change.to,
            receivedTokenAmount: total,
            updatedAt: change.timestamp,
          });

          await auditEvent.append({
            paymentId: payment.id,
            createdAt: change.timestamp,
            oldStatus: change.to,
            newStatus: change.from,
            reason: change.reason,
            metadata: { txHash: transfer.txHash },
          });
        });
      }
    }
  }
}
