export type Hex = `0x${string}`;

export interface ChainTransfer {
  txHash: Hex;
  blockNumber: bigint;
  to: Hex;
  amount: bigint;
}

export interface ChainAdapter {
  getLatestBlock(): Promise<bigint>;
  getTransfersInRange(fromBlock: bigint, toBlock: bigint): Promise<ChainTransfer[]>;
  getConfirmations(blockNumber: bigint): Promise<number>;
}
