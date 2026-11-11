import { describe, expect, it } from "vitest";
import type { ChainAdapter, ChainTransfer, Hex } from "@oya/chain";
import { ScanProcessor } from "../scan-processor.js";
import type { TransferHandler } from "../transfer-handler.js";
import { InMemoryCursorRepository } from "./in-memory-cursor-repository.js";

const CHAIN = "base-sepolia";
const TO: Hex = "0x2222222222222222222222222222222222222222";

function makeTransfer(blockNumber: bigint, txHash: string): ChainTransfer {
  return {
    txHash: txHash as Hex,
    blockNumber,
    to: TO,
    amount: 1_000_000n,
  };
}

class FakeChainAdapter implements ChainAdapter {
  readonly ranges: Array<{ from: bigint; to: bigint }> = [];

  constructor(
    public latestBlock: bigint,
    readonly transfers: ChainTransfer[] = [],
  ) {}

  async getLatestBlock(): Promise<bigint> {
    return this.latestBlock;
  }

  async getTransfersInRange(
    fromBlock: bigint,
    toBlock: bigint,
  ): Promise<ChainTransfer[]> {
    this.ranges.push({ from: fromBlock, to: toBlock });

    return this.transfers.filter(
      (transfer) =>
        transfer.blockNumber >= fromBlock && transfer.blockNumber <= toBlock,
    );
  }

  async getConfirmations(): Promise<number> {
    return 0;
  }
}

class RecordingTransferHandler implements TransferHandler {
  readonly handled: ChainTransfer[] = [];
  failOnTxHash: string | undefined;

  async handle(transfer: ChainTransfer): Promise<void> {
    if (transfer.txHash === this.failOnTxHash) {
      throw new Error(`failed to handle ${transfer.txHash}`);
    }

    this.handled.push(transfer);
  }
}

function makeProcessor(
  chain: FakeChainAdapter,
  cursors: InMemoryCursorRepository,
  transferHandler: TransferHandler,
  chunkSize = 500,
): ScanProcessor {
  return new ScanProcessor({
    chain,
    cursors,
    transferHandler,
    chainId: CHAIN,
    chunkSize,
  });
}

describe("ScanProcessor", () => {
  it("scans from cursor + 1 to latest in chunks and saves the cursor", async () => {
    const transfers = [
      makeTransfer(150n, "0x01"),
      makeTransfer(250n, "0x02"),
    ];
    const chain = new FakeChainAdapter(250n, transfers);
    const cursors = new InMemoryCursorRepository();
    await cursors.saveCursor(CHAIN, 100n);
    const handler = new RecordingTransferHandler();

    const processor = makeProcessor(chain, cursors, handler, 100);
    await processor.scanOnce();

    expect(chain.ranges).toEqual([
      { from: 101n, to: 200n },
      { from: 201n, to: 250n },
    ]);
    expect(handler.handled).toEqual(transfers);
    await expect(cursors.getCursor(CHAIN)).resolves.toBe(250n);
  });

  it("starts at the current latest block on the first run", async () => {
    const transfers = [
      makeTransfer(99n, "0x01"),
      makeTransfer(100n, "0x02"),
    ];
    const chain = new FakeChainAdapter(100n, transfers);
    const cursors = new InMemoryCursorRepository();
    const handler = new RecordingTransferHandler();

    const processor = makeProcessor(chain, cursors, handler);
    await processor.scanOnce();

    expect(chain.ranges).toEqual([{ from: 100n, to: 100n }]);
    expect(handler.handled).toEqual([transfers[1]]);
    await expect(cursors.getCursor(CHAIN)).resolves.toBe(100n);
  });

  it("resumes from the saved cursor after a restart", async () => {
    const cursors = new InMemoryCursorRepository();
    await cursors.saveCursor(CHAIN, 100n);
    const transfers = [
      makeTransfer(101n, "0x01"),
      makeTransfer(103n, "0x02"),
    ];
    const chain = new FakeChainAdapter(103n, transfers);
    const handler = new RecordingTransferHandler();

    const processor = makeProcessor(chain, cursors, handler);
    await processor.scanOnce();

    expect(chain.ranges).toEqual([{ from: 101n, to: 103n }]);
    expect(handler.handled).toEqual(transfers);
    await expect(cursors.getCursor(CHAIN)).resolves.toBe(103n);
  });

  it("does not process the same range twice", async () => {
    const transfer = makeTransfer(95n, "0x01");
    const chain = new FakeChainAdapter(100n, [transfer]);
    const cursors = new InMemoryCursorRepository();
    await cursors.saveCursor(CHAIN, 90n);
    const handler = new RecordingTransferHandler();

    const processor = makeProcessor(chain, cursors, handler);
    await processor.scanOnce();
    await processor.scanOnce();

    expect(chain.ranges).toEqual([{ from: 91n, to: 100n }]);
    expect(handler.handled).toEqual([transfer]);
    await expect(cursors.getCursor(CHAIN)).resolves.toBe(100n);
  });

  it("does not advance the cursor past a failing chunk", async () => {
    const firstChunkTransfer = makeTransfer(100n, "0x01");
    const secondChunkTransfer = makeTransfer(150n, "0x02");
    const chain = new FakeChainAdapter(200n, [
      firstChunkTransfer,
      secondChunkTransfer,
    ]);
    const cursors = new InMemoryCursorRepository();
    await cursors.saveCursor(CHAIN, 90n);
    const handler = new RecordingTransferHandler();
    handler.failOnTxHash = secondChunkTransfer.txHash;

    const processor = makeProcessor(chain, cursors, handler, 50);

    await expect(processor.scanOnce()).rejects.toThrow("failed to handle 0x02");
    await expect(cursors.getCursor(CHAIN)).resolves.toBe(140n);
    expect(handler.handled).toEqual([firstChunkTransfer]);

    handler.failOnTxHash = undefined;
    await processor.scanOnce();

    expect(chain.ranges).toEqual([
      { from: 91n, to: 140n },
      { from: 141n, to: 190n },
      { from: 141n, to: 190n },
      { from: 191n, to: 200n },
    ]);
    await expect(cursors.getCursor(CHAIN)).resolves.toBe(200n);
  });
});
