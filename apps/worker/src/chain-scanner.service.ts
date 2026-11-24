import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ChainAdapter } from '@oya/chain';
import {
  ChainTransactionRepository,
  db,
  PaymentRepository,
} from '@oya/database';

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
    const payments = new PaymentRepository(db);
    const tokenAddress = process.env.DEMO_TOKEN_ADDRESS;

    if (!tokenAddress) throw new Error('SET DEMO TOKEN ADDRESS');

    const chainId = 84532;
    const cursorKey = `${chainId}:${tokenAddress.toLowerCase()}`;

    await db.transaction(async (tx) => {
      const payments = new PaymentRepository(tx);
      const chainTxs = new ChainTransactionRepository(tx);

      for (const transfer of transfers) {
        const payment = await payments.findByDepositAddress({
          chainId: 84532,
          tokenAddress: tokenAddress,
          depositAddress: transfer.to,
        });

        if (!payment) continue;

        await chainTxs.insertDetected({
          paymentId: payment.id,
          txHash: transfer.hash,
          amount: transfer.value.toString(),
          blockNumber: transfer.blockNumber,
          detectedAt: new Date(),
        });
      }

      await chainTxs.advanceCursor(cursorKey, paymentBlock);
    });

    this.logger.log(`Finished scanning block ${paymentBlock}`);
  }
}
