import { parseAbiItem } from "viem";
import { createBaseSepoliaClient } from "./index.js";
import { ChainAdapter, ChainTransfer, Hex } from "./types.js";

type BaseSepoliaClient = ReturnType<typeof createBaseSepoliaClient>;

export interface ChainOptions {
  tokenAddress: Hex;
}

const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

export function createChainAdapter(
  client: BaseSepoliaClient,
  { tokenAddress }: ChainOptions,
): ChainAdapter {
  async function getLatestBlock(): Promise<bigint> {
    return client.getBlockNumber();
  }

  async function getConfirmations(blockNumber: bigint) {
    const latest = await getLatestBlock();
    const diff = latest - blockNumber;

    return diff > 0n ? diff : 0n;
  }

  async function getTransfers(
    fromBlock: bigint,
    toBlock: bigint,
  ): Promise<ChainTransfer[]> {
    if (fromBlock > toBlock) {
      return [];
    }

    const logs = await client.getLogs({
      address: tokenAddress,
      event: transferEvent,
      fromBlock,
      toBlock,
      strict: true,
    });

    return logs.flatMap((log) => {
      if (
        log.blockNumber === null ||
        log.transactionHash === null ||
        log.logIndex === null
      ) {
        return [];
      }

      return [
        {
          hash: log.transactionHash,
          from: log.args.from,
          to: log.args.to,
          value: log.args.value,
          blockNumber: log.blockNumber,
          logIndex: log.logIndex,
        },
      ];
    });
  }

  return { getLatestBlock, getTransfers, getConfirmations };
}

export function createBaseSepoliaAdapter(
  options: ChainOptions & { rpcUrl?: string },
): ChainAdapter {
  const { rpcUrl, ...rest } = options;
  return createChainAdapter(createBaseSepoliaClient(rpcUrl), rest);
}
