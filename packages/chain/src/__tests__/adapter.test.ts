import { describe, it, expect, vi } from "vitest";
import { createChainAdapter } from "../adapter.js";

const TOKEN_ADDRESS = "0x1234567890123456789012345678901234567890" as const;

describe("createChainAdapter", () => {
  it("getLatestBlock returns the block number from the client", async () => {
    const mockClient = {
      getBlockNumber: vi.fn().mockResolvedValue(100n),
      getLogs: vi.fn(),
    } as any;

    const adapter = createChainAdapter(mockClient, { tokenAddress: TOKEN_ADDRESS });
    const block = await adapter.getLatestBlock();

    expect(block).toBe(100n);
    expect(mockClient.getBlockNumber).toHaveBeenCalledOnce();
  });

  it("getConfirmations calculates block difference correctly", async () => {
    const mockClient = {
      getBlockNumber: vi.fn().mockResolvedValue(105n),
    } as any;

    const adapter = createChainAdapter(mockClient, { tokenAddress: TOKEN_ADDRESS });

    const confs = await adapter.getConfirmations(100n);
    expect(confs).toBe(5n);

    const futureConfs = await adapter.getConfirmations(110n);
    expect(futureConfs).toBe(0n);
  });

  it("parses ERC-20 transfer logs into normalized objects", async () => {
    const fakeLog = {
      blockNumber: 50n,
      transactionHash: "0xabc123" as const,
      logIndex: 2,
      args: {
        from: "0x1111111111111111111111111111111111111111" as const,
        to: "0x2222222222222222222222222222222222222222" as const,
        value: 5000000n,
      },
    };

    const mockClient = {
      getLogs: vi.fn().mockResolvedValue([fakeLog]),
    } as any;

    const adapter = createChainAdapter(mockClient, { tokenAddress: TOKEN_ADDRESS });
    const transfers = await adapter.getTransfersInRange(40n, 60n);

    expect(transfers).toHaveLength(1);
    expect(transfers[0]).toEqual({
      hash: "0xabc123",
      from: "0x1111111111111111111111111111111111111111",
      to: "0x2222222222222222222222222222222222222222",
      value: 5000000n,
      blockNumber: 50n,
      logIndex: 2,
    });
  });

  it("returns empty array if fromBlock > toBlock", async () => {
    const mockClient = {
      getLogs: vi.fn(),
    } as any;

    const adapter = createChainAdapter(mockClient, { tokenAddress: TOKEN_ADDRESS });
    const transfers = await adapter.getTransfersInRange(100n, 50n);

    expect(transfers).toEqual([]);
    expect(mockClient.getLogs).not.toHaveBeenCalled();
  });
});
