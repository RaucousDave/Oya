import { parseAbiItem, parseEventLogs, type Log } from "viem";
import { createBaseSepoliaClient } from "./index.js";
import { loadChainEnv } from "./env.js";
import { ChainAdapter, ChainTransfer, Hex } from "./types.js";

export interface ChainClient {
  getBlockNumber(): Promise<bigint>;
  getLogs(args: {
    address: Hex;
    fromBlock: bigint;
    toBlock: bigint;
  }): Promise<Log[]>;
}

export interface ChainOptions {
  tokenAddress: Hex;
}

export const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

const transferAbi = [transferEvent] as const;

export function mapTransferLogs(
  logs: Log[],
  tokenAddress: Hex,
): ChainTransfer[] {
  const expectedAddress = tokenAddress.toLowerCase();

  return parseEventLogs({
    abi: transferAbi,
    eventName: "Transfer",
    logs,
  }).flatMap((log) => {
    if (log.blockNumber === null || log.transactionHash === null) {
      return [];
    }

    if (log.address.toLowerCase() !== expectedAddress) {
      return [];
    }

    return [
      {
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
        to: log.args.to,
        amount: log.args.value,
      },
    ];
  });
}

export function createChainAdapter(
  client: ChainClient,
  { tokenAddress }: ChainOptions,
): ChainAdapter {
  async function getLatestBlock(): Promise<bigint> {
    return client.getBlockNumber();
  }

  async function getConfirmations(blockNumber: bigint): Promise<number> {
    const latest = await getLatestBlock();
    const confirmations = latest - blockNumber + 1n;

    return confirmations > 0n ? Number(confirmations) : 0;
  }

  async function getTransfersInRange(
    fromBlock: bigint,
    toBlock: bigint,
  ): Promise<ChainTransfer[]> {
    if (fromBlock > toBlock) {
      return [];
    }

    const logs = await client.getLogs({
      address: tokenAddress,
      fromBlock,
      toBlock,
    });

    return mapTransferLogs(logs, tokenAddress);
  }

  return { getLatestBlock, getTransfersInRange, getConfirmations };
}

export function createBaseSepoliaAdapter(): ChainAdapter {
  const env = loadChainEnv();
  const client = createBaseSepoliaClient(env.RPC_URL);

  return createChainAdapter(client, { tokenAddress: env.TOKEN_ADDRESS });
}
