import type { ChainAdapter } from "@oya/chain";
import type { CursorRepository } from "./cursor-repository.js";
import type { TransferHandler } from "./transfer-handler.js";

export const DEFAULT_SCAN_CHUNK_SIZE = 500;

export interface ScanProcessorOptions {
  chain: ChainAdapter;
  cursors: CursorRepository;
  transferHandler: TransferHandler;
  chainId: string;
  chunkSize?: number;
}

export class ScanProcessor {
  private readonly chain: ChainAdapter;
  private readonly cursors: CursorRepository;
  private readonly transferHandler: TransferHandler;
  private readonly chainId: string;
  private readonly chunkSize: number;

  constructor(options: ScanProcessorOptions) {
    const chunkSize = options.chunkSize ?? DEFAULT_SCAN_CHUNK_SIZE;

    if (!Number.isInteger(chunkSize) || chunkSize < 1) {
      throw new Error("chunkSize must be a positive integer");
    }

    this.chain = options.chain;
    this.cursors = options.cursors;
    this.transferHandler = options.transferHandler;
    this.chainId = options.chainId;
    this.chunkSize = chunkSize;
  }

  async scanOnce(): Promise<void> {
    const cursor = await this.cursors.getCursor(this.chainId);
    const latestBlock = await this.chain.getLatestBlock();
    let fromBlock = cursor === null ? latestBlock : cursor + 1n;

    if (fromBlock > latestBlock) {
      return;
    }

    const chunkSize = BigInt(this.chunkSize);

    while (fromBlock <= latestBlock) {
      const candidateToBlock = fromBlock + chunkSize - 1n;
      const toBlock =
        candidateToBlock > latestBlock ? latestBlock : candidateToBlock;

      const transfers = await this.chain.getTransfersInRange(
        fromBlock,
        toBlock,
      );

      for (const transfer of transfers) {
        await this.transferHandler.handle(transfer);
      }

      await this.cursors.saveCursor(this.chainId, toBlock);
      fromBlock = toBlock + 1n;
    }
  }
}
