import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { PaymentRepository } from "../repository/payment.repository";
import { ConcurrentUpdateError, NotFoundError } from "../src/errors";
import { payments } from "../src/db/payments";
import { chainTxs } from "../src/db/chain";
import { receipts } from "../src/db/receipts";
import { ledgerEntries } from "../src/db/ledgerEntries";
import { merchants } from "../src/db/merchants";
import { user } from "../src/db/auth-schema";
import type { InsertPaymentInput } from "../types/payment";

// Requires an explicit disposable PostgreSQL URL. Each run owns only its random
// schema; cleanup never drops application schemas or resets an existing database.
test("payment repository against PostgreSQL", async (t) => {
  const connectionString = process.env.DATABASE_TEST_URL;
  assert.ok(connectionString, "Set DATABASE_TEST_URL to a disposable PostgreSQL database");
  const namespace = `payment_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString });
  await admin.query(`CREATE SCHEMA "${namespace}"`);
  const pool = new Pool({ connectionString, options: `-c search_path=${namespace}`, max: 5 });
  const db = drizzle({ client: pool });
  const repo = new PaymentRepository(db);
  const now = new Date("2026-11-18T12:00:00.000Z");
  try {
    const root = new URL("../drizzle/", import.meta.url);
    for (const folder of (await readdir(root)).sort()) {
      const migration = await readFile(new URL(`${folder}/migration.sql`, root), "utf8");
      for (const statement of migration.split("--> statement-breakpoint")) {
        if (statement.trim()) await pool.query(statement);
      }
    }
    async function merchant() {
      const id = randomUUID();
      await db.insert(user).values({ id, name: "Owner", email: `${id}@example.test`, emailVerified: false, createdAt: now, updatedAt: now });
      const [record] = await db.insert(merchants).values({ userId: id, businessName: "Test Shop", bankCode: "PRIVATE", accountNumber: "PRIVATE" }).returning();
      assert.ok(record);
      return record.id;
    }
    function prepared(merchantId: string, overrides: Partial<InsertPaymentInput> = {}): InsertPaymentInput {
      return {
        merchantId, reference: randomUUID(), idempotencyKey: randomUUID(),
        ngnAmountKobo: 9007199254740993n, requiredTokenAmount: "123456789012345678901234",
        tokenAddress: `0x${"AB".repeat(20)}`, tokenDecimals: 6, chainId: 84532,
        lockedRateNumeric: "1500.12345678", rateExpiresAt: new Date(now.getTime() + 60000),
        topUpExpiresAt: new Date(now.getTime() + 360000), depositAddress: `0x${randomUUID().replaceAll("-", "")}abcdef12`,
        createdAt: now, ...overrides,
      };
    }

    await t.test("insert precision, ownership, lookups and uniqueness", async () => {
      const owner = await merchant();
      const input = prepared(owner);
      const payment = await repo.insertPayment(input);
      assert.equal(payment.status, "AWAITING_PAYMENT");
      assert.equal(payment.receivedTokenAmount, "0");
      assert.equal(payment.version, 0);
      assert.equal(payment.ngnAmountKobo, input.ngnAmountKobo);
      assert.equal(payment.lockedRateNumeric, input.lockedRateNumeric);
      assert.equal((await repo.findByIdempotencyKey(input))?.id, payment.id);
      assert.equal((await repo.findIdempotencyKey(input))?.id, payment.id);
      assert.equal(await repo.findByIdempotencyKey({ ...input, merchantId: "other" }), null);
      assert.equal((await repo.findPaymentById({ paymentId: payment.id }))?.id, payment.id);
      assert.equal(await repo.findPaymentById({ paymentId: "missing" }), null);
      assert.equal((await repo.getMerchantPayment(payment.id, owner)).id, payment.id);
      assert.equal((await repo.getMerchantPayment({ paymentId: payment.id, merchantId: owner })).id, payment.id);
      await assert.rejects(repo.getMerchantPayment(payment.id, "other"), NotFoundError);
      await assert.rejects(repo.insertPayment(input));
      await assert.rejects(repo.insertPayment({ ...input, idempotencyKey: randomUUID(), reference: randomUUID() }));
      const query = { chainId: 84532, tokenAddress: input.tokenAddress, depositAddress: input.depositAddress.toUpperCase() };
      assert.equal((await repo.findByDepositAddress(query))?.id, payment.id);
      assert.equal(await repo.findByDepositAddress({ ...query, chainId: 1 }), null);
      assert.equal(await repo.findByDepositAddress({ ...query, tokenAddress: "wrong" }), null);
      await db.update(payments).set({ tokenAddress: input.tokenAddress, depositAddress: input.depositAddress.toUpperCase() }).where(eq(payments.id, payment.id));
      assert.equal((await repo.findByDepositAddress(query))?.id, payment.id);
    });

    await t.test("pagination excludes look-ahead, handles ties, filters and invalid limits", async () => {
      const owner = await merchant();
      for (const id of ["page-a", "page-b", "page-c"]) await repo.insertPayment(prepared(owner, { id }));
      await repo.insertPayment(prepared(await merchant()));
      const first = await repo.listMerchantPayments({ merchantId: owner, limit: 2, status: "AWAITING_PAYMENT", from: now, to: new Date(now.getTime() + 1) });
      assert.deepEqual(first.items.map((row) => row.id), ["page-c", "page-b"]);
      assert.ok(first.nextCursor);
      const second = await repo.listMerchantPayments({ merchantId: owner, limit: 2, cursor: first.nextCursor });
      assert.deepEqual(second.items.map((row) => row.id), ["page-a"]);
      assert.equal(second.nextCursor, null);
      assert.equal((await repo.listMerchantPayments({ merchantId: owner, to: now })).items.length, 0);
      assert.equal((await repo.listMerchantPayments({ merchantId: owner, status: "SETTLED" })).items.length, 0);
      assert.equal((await repo.listMerchantPayments({ merchantId: "missing" })).nextCursor, null);
      for (const limit of [0, -1, 101, 1.5, NaN]) await assert.rejects(repo.listMerchantPayments({ merchantId: owner, limit }), RangeError);
      await assert.rejects(repo.listMerchantPayments({ merchantId: owner, cursor: { timestamp: new Date(NaN), id: "x" } }), TypeError);
    });

    await t.test("checkout privacy and settled receipt availability", async () => {
      const payment = await repo.insertPayment(prepared(await merchant()));
      const view = await repo.getCheckoutPayment({ paymentId: payment.id });
      assert.deepEqual(view.merchant, { businessName: "Test Shop" });
      for (const key of ["merchantId", "userId", "idempotencyKey", "version", "accountNumber", "bankCode"]) assert.equal(key in view, false);
      assert.equal(view.receiptAvailable, false);
      await db.insert(receipts).values({ paymentId: payment.id });
      assert.equal((await repo.getCheckoutPayment({ paymentId: payment.id })).receiptAvailable, false);
      await db.update(payments).set({ status: "SETTLED" }).where(eq(payments.id, payment.id));
      assert.equal((await repo.getCheckoutPayment({ paymentId: payment.id })).receiptAvailable, true);
      await assert.rejects(repo.getCheckoutPayment({ paymentId: "missing" }), NotFoundError);
    });

    await t.test("expiry status, deadline boundaries and bounded batches", async () => {
      const owner = await merchant();
      const awaiting = await repo.insertPayment(prepared(owner, { id: "expiry-a" }));
      const underpaid = await repo.insertPayment(prepared(owner, { id: "expiry-b" }));
      const confirming = await repo.insertPayment(prepared(owner, { id: "expiry-c" }));
      await db.update(payments).set({ status: "UNDERPAID" }).where(eq(payments.id, underpaid.id));
      await db.update(payments).set({ status: "CONFIRMING" }).where(eq(payments.id, confirming.id));
      assert.equal((await repo.listPaymentsDueForExpiry({ now: awaiting.rateExpiresAt, limit: 100 })).some((row) => row.id === awaiting.id), false);
      const atGrace = await repo.listPaymentsDueForExpiry({ now: underpaid.topUpExpiresAt, limit: 100 });
      assert.equal(atGrace.some((row) => row.id === awaiting.id), true);
      assert.equal(atGrace.some((row) => row.id === underpaid.id), false);
      const after = new Date(underpaid.topUpExpiresAt.getTime() + 1);
      assert.deepEqual((await repo.listPaymentsDueForExpiry({ now: after, limit: 1, afterId: "expiry-a" })).map((row) => row.id), ["expiry-b"]);
      assert.equal((await repo.listPaymentsDueForExpiry({ now: after, limit: 100 })).some((row) => row.id === confirming.id), false);
    });

    await t.test("transfer pagination and ownership", async () => {
      const owner = await merchant();
      const payment = await repo.insertPayment(prepared(owner));
      for (const id of ["tx-a", "tx-b", "tx-c"]) await db.insert(chainTxs).values({ id, paymentId: payment.id, detectedAt: now });
      const first = await repo.listTransactions({ paymentId: payment.id, merchantId: owner, limit: 2 });
      assert.deepEqual(first.items.map((row) => row.id), ["tx-c", "tx-b"]);
      assert.ok(first.nextCursor);
      const second = await repo.listTransactions({ paymentId: payment.id, merchantId: owner, limit: 2, cursor: first.nextCursor });
      assert.deepEqual(second.items.map((row) => row.id), ["tx-a"]);
      assert.equal(second.nextCursor, null);
      await assert.rejects(repo.listTransactions({ paymentId: payment.id, merchantId: "other" }), NotFoundError);
    });

    await t.test("transaction enforcement, concurrent updates and atomic rollback", async () => {
      const payment = await repo.insertPayment(prepared(await merchant()));
      const change = { paymentId: payment.id, expectedVersion: 0, expectedStatus: "AWAITING_PAYMENT" as const, nextStatus: "CONFIRMING" as const, receivedTokenAmount: "0", updatedAt: now };
      await assert.rejects(repo.lockPayment({ paymentId: payment.id }), /forTransaction/);
      await assert.rejects(repo.updatePaymentState(change), /forTransaction/);
      const outcomes = await Promise.allSettled([1, 2].map(() => db.transaction(async (tx) => PaymentRepository.forTransaction(tx).updatePaymentState(change))));
      assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 1);
      const rejected = outcomes.find((result) => result.status === "rejected");
      assert.ok(rejected?.status === "rejected" && rejected.reason instanceof ConcurrentUpdateError);
      assert.equal((await repo.findPaymentById({ paymentId: payment.id }))?.version, 1);
      await assert.rejects(db.transaction(async (tx) => {
        const bound = PaymentRepository.forTransaction(tx);
        const locked = await bound.lockPayment({ paymentId: payment.id });
        await bound.updatePaymentState({ ...change, expectedVersion: locked.version, expectedStatus: "CONFIRMING", nextStatus: "PAID", receivedTokenAmount: "123456789012345678901234" });
        await tx.insert(ledgerEntries).values({ paymentId: payment.id, idempotencyKey: "rollback-ledger", amount: "123" });
        throw new Error("Simulated audit write failure");
      }), /Simulated/);
      assert.equal((await repo.findPaymentById({ paymentId: payment.id }))?.status, "CONFIRMING");
      assert.equal((await db.select().from(ledgerEntries).where(eq(ledgerEntries.idempotencyKey, "rollback-ledger"))).length, 0);
      await assert.rejects(db.transaction(async (tx) => PaymentRepository.forTransaction(tx).updatePaymentState({ ...change, expectedVersion: 1, expectedStatus: "CONFIRMING", receivedTokenAmount: "1.2" })), TypeError);
      await assert.rejects(db.transaction(async (tx) => PaymentRepository.forTransaction(tx).lockPayment({ paymentId: "missing" })), NotFoundError);
    });
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA "${namespace}" CASCADE`);
    await admin.end();
  }
});
