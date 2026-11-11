import { describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, encodeEventTopics, type Log } from "viem";
import {
  createChainAdapter,
  mapTransferLogs,
  transferEvent,
  type ChainClient,
} from "../adapter.js";
import type { Hex } from "../types.js";

const TOKEN_ADDRESS: Hex = "0x1234567890123456789012345678901234567890";
const OTHER_TOKEN_ADDRESS: Hex = "0x9999999999999999999999999999999999999999";
const FROM: Hex = "0x1111111111111111111111111111111111111111";
const TO: Hex = "0x2222222222222222222222222222222222222222";
const TX_HASH: Hex =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const BLOCK_HASH: Hex =
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

interface LogOverrides {
  address?: Hex;
  from?: Hex;
  to?: Hex;
  value?: bigint;
  blockNumber?: bigint;
  transactionHash?: Hex;
  logIndex?: number;
}

function makeTransferLog(overrides: LogOverrides = {}): Log {
  const {
    address = TOKEN_ADDRESS,
    from = FROM,
    to = TO,
    value = 5_000_000n,
    blockNumber = 50n,
    transactionHash = TX_HASH,
    logIndex = 2,
  } = overrides;

  return {
    address,
    topics: encodeEventTopics({
      abi: [transferEvent],
      eventName: "Transfer",
      args: { from, to },
    }) as Log["topics"],
    data: encodeAbiParameters([{ type: "uint256" }], [value]),
    blockNumber,
    transactionHash,
    transactionIndex: 0,
    blockHash: BLOCK_HASH,
    logIndex,
    removed: false,
  };
}

describe("mapTransferLogs", () => {
  it("maps an ERC-20 Transfer log to a ChainTransfer", () => {
    const transfers = mapTransferLogs([makeTransferLog()], TOKEN_ADDRESS);

    expect(transfers).toEqual([
      {
        txHash: TX_HASH,
        blockNumber: 50n,
        to: TO,
        amount: 5_000_000n,
      },
    ]);
  });

  it("keeps the token amount as a bigint", () => {
    const [transfer] = mapTransferLogs(
      [makeTransferLog({ value: 123_456_789_012_345_678n })],
      TOKEN_ADDRESS,
    );

    expect(transfer?.amount).toBe(123_456_789_012_345_678n);
    expect(typeof transfer?.amount).toBe("bigint");
  });

  it("ignores Transfer logs from another token address", () => {
    const transfers = mapTransferLogs(
      [makeTransferLog({ address: OTHER_TOKEN_ADDRESS })],
      TOKEN_ADDRESS,
    );

    expect(transfers).toEqual([]);
  });

  it("compares token addresses case-insensitively", () => {
    const transfers = mapTransferLogs(
      [makeTransferLog({ address: TOKEN_ADDRESS.toLowerCase() as Hex })],
      TOKEN_ADDRESS.toUpperCase().replace("0X", "0x") as Hex,
    );

    expect(transfers).toHaveLength(1);
  });
});

describe("createChainAdapter", () => {
  it("returns the latest block number from the client", async () => {
    const client: ChainClient = {
      getBlockNumber: vi.fn(async () => 100n),
      getLogs: vi.fn(async () => []),
    };

    const adapter = createChainAdapter(client, { tokenAddress: TOKEN_ADDRESS });

    await expect(adapter.getLatestBlock()).resolves.toBe(100n);
    expect(client.getBlockNumber).toHaveBeenCalledOnce();
  });

  it("returns latest - blockNumber + 1 confirmations", async () => {
    const client: ChainClient = {
      getBlockNumber: vi.fn(async () => 105n),
      getLogs: vi.fn(async () => []),
    };

    const adapter = createChainAdapter(client, { tokenAddress: TOKEN_ADDRESS });

    await expect(adapter.getConfirmations(100n)).resolves.toBe(6);
    await expect(adapter.getConfirmations(105n)).resolves.toBe(1);
    await expect(adapter.getConfirmations(110n)).resolves.toBe(0);
  });

  it("fetches token logs for the range and maps them", async () => {
    const log = makeTransferLog();
    const client: ChainClient = {
      getBlockNumber: vi.fn(async () => 60n),
      getLogs: vi.fn(async () => [log]),
    };

    const adapter = createChainAdapter(client, { tokenAddress: TOKEN_ADDRESS });
    const transfers = await adapter.getTransfersInRange(40n, 60n);

    expect(client.getLogs).toHaveBeenCalledWith({
      address: TOKEN_ADDRESS,
      fromBlock: 40n,
      toBlock: 60n,
    });
    expect(transfers).toEqual([
      {
        txHash: TX_HASH,
        blockNumber: 50n,
        to: TO,
        amount: 5_000_000n,
      },
    ]);
  });

  it("returns no transfers and does not query the chain when the range is invalid", async () => {
    const client: ChainClient = {
      getBlockNumber: vi.fn(async () => 60n),
      getLogs: vi.fn(async () => []),
    };

    const adapter = createChainAdapter(client, { tokenAddress: TOKEN_ADDRESS });
    const transfers = await adapter.getTransfersInRange(100n, 50n);

    expect(transfers).toEqual([]);
    expect(client.getLogs).not.toHaveBeenCalled();
  });
});
