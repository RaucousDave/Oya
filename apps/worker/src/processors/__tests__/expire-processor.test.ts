import { describe, expect, it } from "vitest";
import type { Clock } from "../clock.js";
import { ExpireProcessor } from "../expire-processor.js";
import type { ExpirePayment } from "../expire-transaction.js";
import { InMemoryExpireTransaction } from "./in-memory-expire-transaction.js";

const CREATED_AT = new Date("2026-11-12T12:00:00.000Z");
const RATE_LOCK_MS = 60 * 1000;
const GRACE_MS = 5 * 60 * 1000;

function at(offsetMs: number): Date {
  return new Date(CREATED_AT.getTime() + offsetMs);
}

function makePayment(overrides: Partial<ExpirePayment> = {}): ExpirePayment {
  return {
    id: "payment-1",
    status: "AWAITING_PAYMENT",
    createdAt: CREATED_AT,
    ...overrides,
  };
}

function makeProcessor(
  database: InMemoryExpireTransaction,
  now: Date,
): ExpireProcessor {
  const clock: Clock = { now: () => now };

  return new ExpireProcessor({ transactions: database, clock });
}

describe("ExpireProcessor", () => {
  it("expires an AWAITING_PAYMENT just after its rate lock ends", async () => {
    const payment = makePayment();
    const database = new InMemoryExpireTransaction([payment]);
    const now = at(RATE_LOCK_MS + 1);
    const processor = makeProcessor(database, now);

    await processor.expireOnce();

    expect(database.payments.get(payment.id)?.status).toBe("EXPIRED");
    expect(database.auditEvents).toEqual([
      {
        paymentId: payment.id,
        fromStatus: "AWAITING_PAYMENT",
        toStatus: "EXPIRED",
        reason: "rate_lock_expired",
        txHash: null,
        createdAt: now,
      },
    ]);
  });

  it("does not expire at the exact rate lock boundary", async () => {
    const payment = makePayment();
    const database = new InMemoryExpireTransaction([payment]);
    const processor = makeProcessor(database, at(RATE_LOCK_MS));

    await processor.expireOnce();

    expect(database.payments.get(payment.id)?.status).toBe("AWAITING_PAYMENT");
    expect(database.auditEvents).toEqual([]);
  });

  it("expires an AWAITING_PAYMENT once the rate lock has passed, even within the grace window", async () => {
    const payment = makePayment();
    const database = new InMemoryExpireTransaction([payment]);
    const processor = makeProcessor(database, at(RATE_LOCK_MS + 120 * 1000));

    await processor.expireOnce();

    expect(database.payments.get(payment.id)?.status).toBe("EXPIRED");
  });

  it("keeps an UNDERPAID payment during the 5-minute top-up grace", async () => {
    const payment = makePayment({ status: "UNDERPAID" });
    const database = new InMemoryExpireTransaction([payment]);
    const processor = makeProcessor(database, at(RATE_LOCK_MS + GRACE_MS));

    await processor.expireOnce();

    expect(database.payments.get(payment.id)?.status).toBe("UNDERPAID");
    expect(database.auditEvents).toEqual([]);
  });

  it("expires an UNDERPAID payment only after the top-up grace ends", async () => {
    const payment = makePayment({ status: "UNDERPAID" });
    const database = new InMemoryExpireTransaction([payment]);
    const now = at(RATE_LOCK_MS + GRACE_MS + 1);
    const processor = makeProcessor(database, now);

    await processor.expireOnce();

    expect(database.payments.get(payment.id)?.status).toBe("EXPIRED");
    expect(database.auditEvents).toEqual([
      {
        paymentId: payment.id,
        fromStatus: "UNDERPAID",
        toStatus: "EXPIRED",
        reason: "top_up_grace_expired",
        txHash: null,
        createdAt: now,
      },
    ]);
  });

  it("leaves a payment paid just before expiry at PAID", async () => {
    const payment = makePayment();
    const database = new InMemoryExpireTransaction([payment]);
    const processor = makeProcessor(database, at(RATE_LOCK_MS + 1));

    database.afterCandidatesRead = () => {
      const current = database.payments.get(payment.id);

      if (current !== undefined) {
        database.payments.set(payment.id, { ...current, status: "PAID" });
      }
    };

    await processor.expireOnce();

    expect(database.payments.get(payment.id)?.status).toBe("PAID");
    expect(database.auditEvents).toEqual([]);
  });

  it("does not transition a payment whose current status cannot expire", async () => {
    const payment = makePayment();
    const database = new InMemoryExpireTransaction([payment]);
    const processor = makeProcessor(database, at(RATE_LOCK_MS + 1));

    database.afterCandidatesRead = () => {
      const current = database.payments.get(payment.id);

      if (current !== undefined) {
        database.payments.set(payment.id, {
          ...current,
          status: "CONFIRMING",
        });
      }
    };

    await processor.expireOnce();

    expect(database.payments.get(payment.id)?.status).toBe("CONFIRMING");
    expect(database.auditEvents).toEqual([]);
  });

  it("expires only the payments that are due", async () => {
    const due = makePayment({ id: "payment-1" });
    const notDue = makePayment({ id: "payment-2", createdAt: at(1_000) });
    const database = new InMemoryExpireTransaction([due, notDue]);
    const processor = makeProcessor(database, at(RATE_LOCK_MS + 1));

    await processor.expireOnce();

    expect(database.payments.get(due.id)?.status).toBe("EXPIRED");
    expect(database.payments.get(notDue.id)?.status).toBe("AWAITING_PAYMENT");
    expect(database.auditEvents).toHaveLength(1);
  });

  it("changes nothing when run twice on the same data", async () => {
    const payment = makePayment();
    const database = new InMemoryExpireTransaction([payment]);
    const processor = makeProcessor(database, at(RATE_LOCK_MS + 1));

    await processor.expireOnce();

    const afterFirstRun = {
      payment: { ...database.payments.get(payment.id) },
      auditEvents: [...database.auditEvents],
    };

    await processor.expireOnce();

    expect({
      payment: { ...database.payments.get(payment.id) },
      auditEvents: [...database.auditEvents],
    }).toEqual(afterFirstRun);
    expect(database.auditEvents).toHaveLength(1);
  });
});
