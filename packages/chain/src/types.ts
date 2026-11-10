export interface ChainAdapter {
  getLatestBlock(): Promise<bigint>;
  getConfirmations(blockNumber: bigint): Promise<bigint>;
}
