export type Hex = `0x${string}`;

export interface ChainTransfer {
  hash: Hex;
  from: Hex;
  to: Hex;
  value: bigint;
  blockNumber: bigint;
  logIndex: number;
}
export interface ChainAdapter {
  getLatestBlock(): Promise<bigint>;
  getTransfers(fromBlock: bigint, toBlock: bigint): Promise<ChainTransfer[]>;
  getConfirmations(blockNumber: bigint): Promise<bigint>;
}
