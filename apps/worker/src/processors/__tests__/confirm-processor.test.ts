import { describe, expect, it } from "vitest";
import type { ChainAdapter, Hex } from "@oya/chain";
import type { Clock } from "../clock.js";
import {
  CONFIRMATIONS_REQUIRED,
  ConfirmProcessor,
} from "../confirm-processor.js";
import type { ConfirmableChainTx, ConfirmPayment } from "../confirm-transaction.js";
import { InMemoryConfirmTransaction } from "./in-memory-confirm-transaction.js";

const TX_1: Hex =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TX_2: Hex =
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const NOW = new Date("2026-11-12T12:00:00.000Z");
const clock: Clock = { now: () => NOW };

class FakeChain implements Pick<ChainAdapter, "getLatestBlock"> {
  constructor(private readonly latestBlock: bigint) {}

  async getLatestBlock(): Promise<bigint> {
    return this.latestBlock;
  }
}

function makePayment(overrides: Partial<ConfirmPayment> = {}): ConfirmPayment {
  return {
    id: "payment-1",
    status: "CONFIRMING",
    requiredAmount: 1_000_000n,
    ...overrides,
  };
}

function makeChainTx(
  overrides: Partial<ConfirmableChainTx> = {},
): ConfirmableChainTx {
  return {
    txHash: TX_1,
    paymentId: "payment-1",
    blockNumber: 100n,
    amount: 1_000_000n,
    confirmations: 0,
    ...overrides,
  };
}

function makeProcessor(
  latestBlock: bigint,
  database: InMemoryConfirmTransaction,
): ConfirmProcessor {
  return new ConfirmProcessor({
    chain: new FakeChain(latestBlock),
    transactions: database,
    clock,
  });
}

describe("ConfirmProcessor", () => {
  it("marks an exactly paid payment as PAID and stores confirmations", async () => {
    const payment = makePayment();
    const database = new InMemoryConfirmTransaction(
      [payment],
      [makeChainTx()],
    );
    const processor = makeProcessor(101n, database);

    await processor.confirmOnce();

    expect(database.chainTxs[0]?.confirmations).toBe(2);
    expect(database.payments.get(payment.id)).toEqual({
      ...payment,
      status: "PAID",
    });
    expect(database.ledgerEntries).toEqual([]);
    expect(database.auditEvents).toEqual([
      {
        paymentId: payment.id,
        fromStatus: "CONFIRMING",
        toStatus: "PAID",
        reason: "amount_exact",
        txHash: null,
        createdAt: NOW,
      },
    ]);
  });

  it("sums multiple confirmed transfers for one payment", async () => {
    const payment = makePayment();
    const database = new InMemoryConfirmTransaction(
      [payment],
      [
        makeChainTx({ amount: 400_000n }),
        makeChainTx({ txHash: TX_2, amount: 600_000n }),
      ],
    );
    const processor = makeProcessor(101n, database);

    await processor.confirmOnce();

    expect(database.payments.get(payment.id)?.status).toBe("PAID");
    expect(database.chainTxs.map((chainTx) => chainTx.confirmations)).toEqual([
      2, 2,
    ]);
  });

  it("marks a payment below the required amount as UNDERPAID", async () => {
    const payment = makePayment();
    const database = new InMemoryConfirmTransaction(
      [payment],
      [makeChainTx({ amount: 400_000n })],
    );
    const processor = makeProcessor(101n, database);

    await processor.confirmOnce();

    expect(database.payments.get(payment.id)?.status).toBe("UNDERPAID");
    expect(database.ledgerEntries).toEqual([]);
    expect(database.auditEvents).toEqual([
      {
        paymentId: payment.id,
        fromStatus: "CONFIRMING",
        toStatus: "UNDERPAID",
        reason: "amount_underpaid",
        txHash: null,
        createdAt: NOW,
      },
    ]);
  });

  it("marks a payment above the required amount as OVERPAID with a surplus ledger entry", async () => {
    const payment = makePayment();
    const database = new InMemoryConfirmTransaction(
      [payment],
      [makeChainTx({ amount: 1_500_000n })],
    );
    const processor = makeProcessor(101n, database);

    await processor.confirmOnce();

    expect(database.payments.get(payment.id)?.status).toBe("OVERPAID");
    expect(database.ledgerEntries).toEqual([
      {
        paymentId: payment.id,
        entryType: "OVERPAYMENT_SURPLUS",
        amount: 500_000n,
        createdAt: NOW,
      },
    ]);
    expect(database.auditEvents).toEqual([
      {
        paymentId: payment.id,
        fromStatus: "CONFIRMING",
        toStatus: "OVERPAID",
        reason: "amount_overpaid",
        txHash: null,
        createdAt: NOW,
      },
    ]);
  });

  it("completes an UNDERPAID payment when a top-up confirms", async () => {
    const payment = makePayment({ status: "UNDERPAID" });
    const database = new InMemoryConfirmTransaction(
      [payment],
      [
        makeChainTx({
          txHash: TX_1,
          blockNumber: 90n,
          amount: 400_000n,
          confirmations: 5,
        }),
        makeChainTx({
          txHash: TX_2,
          blockNumber: 100n,
          amount: 600_000n,
          confirmations: 0,
        }),
      ],
    );
    const processor = makeProcessor(101n, database);

    await processor.confirmOnce();

    expect(database.payments.get(payment.id)?.status).toBe("PAID");
    expect(database.chainTxs[1]?.confirmations).toBe(2);
    expect(database.auditEvents).toEqual([
      {
        paymentId: payment.id,
        fromStatus: "UNDERPAID",
        toStatus: "CONFIRMING",
        reason: "top_up_confirmed",
        txHash: null,
        createdAt: NOW,
      },
      {
        paymentId: payment.id,
        fromStatus: "CONFIRMING",
        toStatus: "PAID",
        reason: "amount_exact",
        txHash: null,
        createdAt: NOW,
      },
    ]);
  });

  it("leaves the payment CONFIRMING when confirmations are below the requirement", async () => {
    const payment = makePayment();
    const database = new InMemoryConfirmTransaction(
      [payment],
      [makeChainTx({ blockNumber: 101n })],
    );
    const processor = makeProcessor(101n, database);

    await processor.confirmOnce();

    expect(database.chainTxs[0]?.confirmations).toBe(1);
    expect(database.payments.get(payment.id)?.status).toBe("CONFIRMING");
    expect(database.ledgerEntries).toEqual([]);
    expect(database.auditEvents).toEqual([]);
  });

  it("changes nothing when run twice on the same data", async () => {
    const payment = makePayment();
    const database = new InMemoryConfirmTransaction(
      [payment],
      [makeChainTx()],
    );
    const processor = makeProcessor(101n, database);

    await processor.confirmOnce();

    const afterFirstRun = {
      payment: { ...database.payments.get(payment.id) },
      chainTxs: database.chainTxs.map((chainTx) => ({ ...chainTx })),
      ledgerEntries: [...database.ledgerEntries],
      auditEvents: [...database.auditEvents],
    };

    await processor.confirmOnce();

    expect({
      payment: { ...database.payments.get(payment.id) },
      chainTxs: database.chainTxs.map((chainTx) => ({ ...chainTx })),
      ledgerEntries: [...database.ledgerEntries],
      auditEvents: [...database.auditEvents],
    }).toEqual(afterFirstRun);
    expect(database.auditEvents).toHaveLength(1);
    expect(database.ledgerEntries).toHaveLength(0);
  });

  it("does not transition a payment whose status refuses confirmation updates", async () => {
    const payment = makePayment({ status: "EXPIRED" });
    const database = new InMemoryConfirmTransaction(
      [payment],
      [makeChainTx()],
    );
    const processor = makeProcessor(101n, database);

    await processor.confirmOnce();

    expect(database.chainTxs[0]?.confirmations).toBe(2);
    expect(database.payments.get(payment.id)?.status).toBe("EXPIRED");
    expect(database.auditEvents).toEqual([]);
    expect(database.ledgerEntries).toEqual([]);
  });

  it("requires a positive confirmation count", () => {
    const database = new InMemoryConfirmTransaction();

    expect(
      () =>
        new ConfirmProcessor({
          chain: new FakeChain(101n),
          transactions: database,
          clock,
          requiredConfirmations: 0,
        }),
    ).toThrow("requiredConfirmations must be a positive integer");
    expect(CONFIRMATIONS_REQUIRED).toBe(2);
  });
});
