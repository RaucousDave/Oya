import { describe, expect, it } from "vitest";
import type { ChainTransfer, Hex } from "@oya/chain";
import type { Clock } from "../clock.js";
import { TransferProcessor } from "../transfer-processor.js";
import type { Payment } from "../transfer-transaction.js";
import { InMemoryTransferTransaction } from "./in-memory-transfer-transaction.js";

const PAYMENT_ADDRESS: Hex = "0xAbCdEf0123456789aBcDeF0123456789AbCdEf01";
const TRANSFER_TO: Hex = PAYMENT_ADDRESS.toLowerCase() as Hex;
const OTHER_ADDRESS: Hex =
  "0x1111111111111111111111111111111111111111";
const TX_HASH: Hex =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const OTHER_TX_HASH: Hex =
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const NOW = new Date("2026-11-11T12:00:00.000Z");
const clock: Clock = { now: () => NOW };

function makeTransfer(overrides: Partial<ChainTransfer> = {}): ChainTransfer {
  return {
    txHash: TX_HASH,
    blockNumber: 100n,
    to: TRANSFER_TO,
    amount: 1_000_000n,
    ...overrides,
  };
}

function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: "payment-1",
    depositAddress: PAYMENT_ADDRESS,
    status: "AWAITING_PAYMENT",
    receivedAmount: 0n,
    ...overrides,
  };
}

function makeProcessor(database: InMemoryTransferTransaction): TransferProcessor {
  return new TransferProcessor(database, clock);
}

describe("TransferProcessor", () => {
  it("processes a new transfer in one transaction", async () => {
    const payment = makePayment();
    const database = new InMemoryTransferTransaction([payment]);
    const processor = makeProcessor(database);

    await processor.handle(makeTransfer());

    expect(database.chainTxs).toEqual([
      {
        txHash: TX_HASH,
        paymentId: payment.id,
        blockNumber: 100n,
        to: TRANSFER_TO,
        amount: 1_000_000n,
      },
    ]);
    expect(database.payments.get(payment.id)).toEqual({
      ...payment,
      status: "CONFIRMING",
      receivedAmount: 1_000_000n,
    });
    expect(database.auditEvents).toEqual([
      {
        paymentId: payment.id,
        fromStatus: "AWAITING_PAYMENT",
        toStatus: "CONFIRMING",
        reason: "transfer_received",
        txHash: TX_HASH,
        createdAt: NOW,
      },
    ]);
  });

  it("stops when the tx_hash already exists", async () => {
    const payment = makePayment();
    const database = new InMemoryTransferTransaction([payment]);
    const processor = makeProcessor(database);

    await processor.handle(makeTransfer());
    await processor.handle(makeTransfer());

    expect(database.chainTxs).toHaveLength(1);
    expect(database.auditEvents).toHaveLength(1);
    expect(database.payments.get(payment.id)?.receivedAmount).toBe(1_000_000n);
  });

  it("ignores a transfer whose deposit address is unknown", async () => {
    const payment = makePayment();
    const database = new InMemoryTransferTransaction([payment]);
    const processor = makeProcessor(database);

    await processor.handle(makeTransfer({ to: OTHER_ADDRESS }));

    expect(database.chainTxs).toEqual([]);
    expect(database.auditEvents).toEqual([]);
    expect(database.payments.get(payment.id)).toEqual(payment);
  });

  it("rolls back when the state machine refuses the transition", async () => {
    const payment = makePayment({
      status: "EXPIRED",
      receivedAmount: 500_000n,
    });
    const database = new InMemoryTransferTransaction([payment]);
    const processor = makeProcessor(database);

    await expect(processor.handle(makeTransfer())).rejects.toThrow(
      "Invalid payment transition: cannot move from EXPIRED to CONFIRMING",
    );

    expect(database.chainTxs).toEqual([]);
    expect(database.auditEvents).toEqual([]);
    expect(database.payments.get(payment.id)).toEqual(payment);
  });

  it("tops up an UNDERPAID payment back to CONFIRMING", async () => {
    const payment = makePayment({
      status: "UNDERPAID",
      receivedAmount: 500_000n,
    });
    const database = new InMemoryTransferTransaction([payment]);
    const processor = makeProcessor(database);

    await processor.handle(
      makeTransfer({ txHash: OTHER_TX_HASH, amount: 500_000n }),
    );

    expect(database.payments.get(payment.id)).toEqual({
      ...payment,
      status: "CONFIRMING",
      receivedAmount: 1_000_000n,
    });
    expect(database.auditEvents).toEqual([
      {
        paymentId: payment.id,
        fromStatus: "UNDERPAID",
        toStatus: "CONFIRMING",
        reason: "transfer_received",
        txHash: OTHER_TX_HASH,
        createdAt: NOW,
      },
    ]);
  });
});
