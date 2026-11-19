import { describe, expect, it } from "vitest";
import type { Hex } from "@oya/chain";
import type { Clock } from "../clock.js";
import { MockPayoutProvider } from "../mock-payout-provider.js";
import type { PayoutProvider } from "../payout-provider.js";
import { PayoutProcessor } from "../payout-processor.js";
import type { PayoutPayment } from "../payout-transaction.js";
import { InMemoryPayoutTransaction } from "./in-memory-payout-transaction.js";
import { InMemoryStatusNotifier } from "./in-memory-status-notifier.js";

const TX_1: Hex =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TX_2: Hex =
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const NOW = new Date("2026-11-12T12:00:00.000Z");
const clock: Clock = { now: () => NOW };

function makePayment(overrides: Partial<PayoutPayment> = {}): PayoutPayment {
  return {
    id: "payment-1",
    status: "PAID",
    merchantId: "merchant-1",
    ngnAmountKobo: 5_000_000n,
    tokenAmount: 33_000_000n,
    rate: "1515.15",
    txHashes: [TX_1],
    ...overrides,
  };
}

function makeProcessor(
  database: InMemoryPayoutTransaction,
  provider: PayoutProvider = new MockPayoutProvider(),
  notifier = new InMemoryStatusNotifier(),
): PayoutProcessor {
  return new PayoutProcessor({ transactions: database, provider, clock, statusNotifier: notifier });
}

describe("PayoutProcessor", () => {
  it("pays out a PAID payment and settles it with payout, ledger and receipt rows", async () => {
    const payment = makePayment();
    const database = new InMemoryPayoutTransaction([payment]);
    const provider = new MockPayoutProvider();
    const notifier = new InMemoryStatusNotifier();
    const processor = makeProcessor(database, provider, notifier);

    await processor.payoutOnce();

    expect(database.payments.get(payment.id)?.status).toBe("SETTLED");
    expect(notifier.notifications).toEqual([payment.id, payment.id]);
    expect([...database.payouts.values()]).toEqual([
      {
        paymentId: payment.id,
        amountKobo: 5_000_000n,
        status: "COMPLETED",
        provider: "mock",
        providerReference: `mock-${payment.id}`,
        createdAt: NOW,
      },
    ]);
    expect([...database.ledgerEntries.values()]).toEqual([
      {
        paymentId: payment.id,
        entryType: "MERCHANT_BALANCE",
        amount: 5_000_000n,
        createdAt: NOW,
      },
      {
        paymentId: payment.id,
        entryType: "PAYOUT",
        amount: 5_000_000n,
        createdAt: NOW,
      },
    ]);
    expect([...database.receipts.values()]).toEqual([
      {
        paymentId: payment.id,
        merchantId: "merchant-1",
        ngnAmountKobo: 5_000_000n,
        tokenAmount: 33_000_000n,
        rate: "1515.15",
        txHashes: [TX_1],
        createdAt: NOW,
      },
    ]);
    expect(database.auditEvents).toEqual([
      {
        paymentId: payment.id,
        fromStatus: "PAID",
        toStatus: "PAYOUT_PENDING",
        reason: "payout_started",
        txHash: null,
        createdAt: NOW,
      },
      {
        paymentId: payment.id,
        fromStatus: "PAYOUT_PENDING",
        toStatus: "SETTLED",
        reason: "payout_settled",
        txHash: null,
        createdAt: NOW,
      },
    ]);
    expect(provider.calls).toEqual([
      {
        idempotencyKey: payment.id,
        paymentId: payment.id,
        merchantId: "merchant-1",
        amountKobo: 5_000_000n,
      },
    ]);
    expect(provider.payoutCount).toBe(1);
  });

  it("creates no duplicate payout or receipt when retried after a failure midway", async () => {
    const payment = makePayment({ txHashes: [TX_1, TX_2] });
    const database = new InMemoryPayoutTransaction([payment]);
    const provider = new MockPayoutProvider();
    const processor = makeProcessor(database, provider);

    database.failNextInsertOf = "insertLedgerEntry";

    await expect(processor.payoutOnce()).rejects.toThrow(
      "insertLedgerEntry failed",
    );

    expect(database.payments.get(payment.id)?.status).toBe("PAID");
    expect(database.payouts.size).toBe(0);
    expect(database.receipts.size).toBe(0);
    expect(database.ledgerEntries.size).toBe(0);
    expect(database.auditEvents).toEqual([]);
    expect(provider.payoutCount).toBe(1);

    await processor.payoutOnce();

    expect(database.payments.get(payment.id)?.status).toBe("SETTLED");
    expect(database.payouts.size).toBe(1);
    expect(database.receipts.size).toBe(1);
    expect(database.ledgerEntries.size).toBe(2);
    expect(database.auditEvents).toHaveLength(2);
    expect(provider.payoutCount).toBe(1);
    expect(provider.calls).toHaveLength(2);
  });

  it("only picks up PAID payments", async () => {
    const paid = makePayment({ id: "paid" });
    const notPaid = [
      makePayment({ id: "pending", status: "PAYOUT_PENDING" }),
      makePayment({ id: "settled", status: "SETTLED" }),
      makePayment({ id: "confirming", status: "CONFIRMING" }),
      makePayment({ id: "overpaid", status: "OVERPAID" }),
      makePayment({ id: "expired", status: "EXPIRED" }),
    ];
    const database = new InMemoryPayoutTransaction([paid, ...notPaid]);
    const provider = new MockPayoutProvider();
    const processor = makeProcessor(database, provider);

    await processor.payoutOnce();

    expect(database.payments.get("paid")?.status).toBe("SETTLED");

    for (const payment of notPaid) {
      expect(database.payments.get(payment.id)?.status).toBe(payment.status);
    }

    expect([...database.payouts.keys()]).toEqual(["paid"]);
    expect([...database.receipts.keys()]).toEqual(["paid"]);
    expect(database.auditEvents.map((event) => event.paymentId)).toEqual([
      "paid",
      "paid",
    ]);
    expect(provider.calls.map((call) => call.paymentId)).toEqual(["paid"]);
  });

  it("changes nothing when run twice on the same data", async () => {
    const payment = makePayment();
    const database = new InMemoryPayoutTransaction([payment]);
    const provider = new MockPayoutProvider();
    const processor = makeProcessor(database, provider);

    await processor.payoutOnce();

    const afterFirstRun = {
      payment: { ...database.payments.get(payment.id) },
      payouts: [...database.payouts.values()].map((payout) => ({ ...payout })),
      ledgerEntries: [...database.ledgerEntries.values()].map((entry) => ({
        ...entry,
      })),
      receipts: [...database.receipts.values()].map((receipt) => ({
        ...receipt,
        txHashes: [...receipt.txHashes],
      })),
      auditEvents: database.auditEvents.map((event) => ({ ...event })),
    };

    await processor.payoutOnce();

    expect({
      payment: { ...database.payments.get(payment.id) },
      payouts: [...database.payouts.values()].map((payout) => ({ ...payout })),
      ledgerEntries: [...database.ledgerEntries.values()].map((entry) => ({
        ...entry,
      })),
      receipts: [...database.receipts.values()].map((receipt) => ({
        ...receipt,
        txHashes: [...receipt.txHashes],
      })),
      auditEvents: database.auditEvents.map((event) => ({ ...event })),
    }).toEqual(afterFirstRun);
    expect(provider.calls).toHaveLength(1);
    expect(database.payouts.size).toBe(1);
    expect(database.receipts.size).toBe(1);
  });

  it("does not transition a candidate that is no longer PAID when re-read", async () => {
    const payment = makePayment();
    const database = new InMemoryPayoutTransaction([payment]);
    const provider = new MockPayoutProvider();
    const processor = makeProcessor(database, provider);

    database.afterCandidatesRead = () => {
      database.payments.set(payment.id, {
        ...payment,
        status: "EXPIRED",
      });
    };

    await processor.payoutOnce();

    expect(database.payments.get(payment.id)?.status).toBe("EXPIRED");
    expect(database.payouts.size).toBe(0);
    expect(database.receipts.size).toBe(0);
    expect(database.ledgerEntries.size).toBe(0);
    expect(database.auditEvents).toEqual([]);
    expect(provider.calls).toEqual([]);
  });

  it("leaves the payment PAID when the payout provider fails", async () => {
    const payment = makePayment();
    const database = new InMemoryPayoutTransaction([payment]);
    const provider = {
      createPayout: async (): Promise<never> => {
        throw new Error("provider unavailable");
      },
    };
    const processor = makeProcessor(database, provider);

    await expect(processor.payoutOnce()).rejects.toThrow(
      "provider unavailable",
    );

    expect(database.payments.get(payment.id)?.status).toBe("PAID");
    expect(database.payouts.size).toBe(0);
    expect(database.receipts.size).toBe(0);
    expect(database.ledgerEntries.size).toBe(0);
    expect(database.auditEvents).toEqual([]);
  });
});
