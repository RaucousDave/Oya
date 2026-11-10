import { createBaseSepoliaClient } from "./index.js";
import { ChainAdapter } from "./types.js";

type BaseSepoliaClient = ReturnType<typeof createBaseSepoliaClient>;

export function createChainAdapter(client: BaseSepoliaClient): ChainAdapter {
  async function getLatestBlock(): Promise<bigint> {
    return client.getBlockNumber();
  }

  async function getConfirmations(blockNumber: bigint) {
    const latest = await getLatestBlock();
    const diff = latest - blockNumber;

    return diff > 0n ? diff : 0n;
  }

  return { getLatestBlock, getConfirmations };
}

export function createBaseSepoliaAdapter(rpcUrl?: string): ChainAdapter {
  return createChainAdapter(createBaseSepoliaClient(rpcUrl));
}
