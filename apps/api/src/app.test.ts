import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import type { CheckoutPayment, MerchantPayment, MerchantPayments, PaymentReceipt } from "@oya/contracts";

test("mounted merchant and public payment routes", { skip: !process.env.DATABASE_TEST_URL }, async (t) => {
  process.env.DATABASE_URL = process.env.DATABASE_TEST_URL;
  process.env.BETTER_AUTH_SECRET ??= "oya-integration-only-secret-with-at-least-32-characters";
  process.env.WEB_ORIGIN = "http://localhost:5173";
  process.env.DEPOSIT_XPUB ??= "xpub661MyMwAqRbcFhCvdhTAfpEEDV58oqDvv65YNHC686NNs4KbH8YZQJWVmrfbve7aAVHzxw8bKFxA7MLeDK6BbLfkE3bqkvHLPgaGHHtYGeY";
  process.env.DEMO_TOKEN_ADDRESS = `0x${"11".repeat(20)}`;
  process.env.DEMO_TOKEN_DECIMALS = "6";
  process.env.FIXED_NGN_USD_RATE = "1500.00000001";
  const { createApp } = await import("./create-app");
  const {
    db, AuditEventRepository, ChainTransactionRepository, LedgerEntriesRepository,
    PaymentRepository, PayoutRepository, ReceiptRepository,
  } = await import("@oya/database");

  const app = await createApp();
  await app.listen(0, "127.0.0.1");
  t.after(async () => { await app.close(); await db.$client.end(); });
  const origin = await app.getUrl();
  async function request(path: string, status: number, options: { body?: object; cookie?: string; key?: string; method?: string } = {}) {
    const headers = new Headers({ Origin: process.env.WEB_ORIGIN! });
    if (options.cookie) headers.set("Cookie", options.cookie);
    if (options.body) headers.set("Content-Type", "application/json");
    if (options.key) headers.set("Idempotency-Key", options.key);
    const response = await fetch(origin + path, {
      headers, method: options.method ?? (options.body ? "POST" : "GET"),
      body: options.body && JSON.stringify(options.body), signal: AbortSignal.timeout(10_000),
    });
    assert.equal(response.status, status, response.status !== status ? await response.text() : path);
    return response;
  }

  const cookieOf = (response: Response) => {
    const cookie = response.headers.getSetCookie()[0]?.split(";")[0];
    assert.ok(cookie);
    return cookie;
  };
  const email = `${crypto.randomUUID()}@example.com`;
  const password = "integration-password-1";
  const signup = await request("/auth/signup", 201, { body: { email, password, businessName: "Oya integration shop" } });
  assert.equal(signup.headers.get("access-control-allow-credentials"), "true");
  const merchant = await signup.json();
  await request("/auth/login", 401, { body: { email, password: "incorrect-password" } });
  const cookie = cookieOf(await request("/auth/login", 200, { body: { email, password } }));
  assert.deepEqual(await (await request("/auth/session", 200, { cookie })).json(), merchant);
  await request("/merchant/payments", 401);
  await request("/payments", 401, { body: { amount: "8500.00" } });
  await request("/payments", 400, { body: { amount: "0" }, cookie, key: "invalid" });
  await request("/payments", 400, { body: { amount: "1" }, cookie });
  await request("/payments/unknown", 404);
  await request("/payments/unknown/events", 404);

  const key = crypto.randomUUID();
  const body = { amount: "8500.00", description: "Invoice 24" };
  const responses = await Promise.all([
    request("/payments", 201, { body, key, cookie }),
    request("/payments", 201, { body, key, cookie }),
  ]);
  const created: CheckoutPayment = await responses[0]!.json();
  assert.deepEqual(await responses[1]!.json(), created);
  assert.equal(created.ngnAmountKobo, "850000");
  assert.equal(created.requiredTokenAmount, "5666667");
  assert.equal(created.lockedRate, "1500.00000001");
  assert.equal(created.status, "AWAITING_PAYMENT");
  assert.equal(Date.parse(created.rateExpiresAt) - Date.parse(created.createdAt), 60_000);
  assert.ok(created.qrPayload.endsWith("uint256=5666667"));
  assert.ok(created.paymentUrl.endsWith(`/pay/${created.id}`));
  assert.equal("merchantId" in created, false);
  assert.equal("idempotencyKey" in created, false);
  await request("/payments", 409, { body: { amount: "9000" }, key, cookie });

  const paymentPath = `/payments/${created.id}`;
  const merchantPath = `/merchant${paymentPath}`;
  const isolated = cookieOf(await request("/auth/signup", 201, { body: {
    email: `${crypto.randomUUID()}@example.com`, password, businessName: "Another merchant",
  } }));
  await request(merchantPath, 404, { cookie: isolated });
  await request(`${merchantPath}/receipt`, 404, { cookie: isolated });
  await request(`${paymentPath}/receipt`, 404);
  await request(`${merchantPath}/receipt`, 404, { cookie });
  await request("/merchant/payments?limit=0", 400, { cookie });
  const list: MerchantPayments = await (await request("/merchant/payments?status=AWAITING_PAYMENT", 200, { cookie })).json();
  assert.deepEqual(list.items.map(({ id }) => id), [created.id]);
  assert.deepEqual(list.totals, { today: "850000", week: "850000" });
  const detail: MerchantPayment = await (await request(merchantPath, 200, { cookie })).json();
  assert.equal(detail.audit.items.length, 1);
  assert.equal(detail.payout, null);
  assert.deepEqual(await (await request(paymentPath, 200)).json(), created);

  const eventResponse = await request(`${paymentPath}/events`, 200);
  assert.match(eventResponse.headers.get("content-type")!, /text\/event-stream/);
  const reader = eventResponse.body!.getReader();
  t.after(() => reader.cancel().catch(() => {}));
  const decoder = new TextDecoder();
  let buffer = "";
  async function readEvent(): Promise<CheckoutPayment> {
    while (true) {
      const end = buffer.indexOf("\n\n");
      if (end >= 0) {
        const frame = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const data = frame.split("\n").find((line) => line.startsWith("data:"));
        if (data) return JSON.parse(data.slice(5));
      } else {
        const chunk = await reader.read();
        assert.equal(chunk.done, false);
        buffer += decoder.decode(chunk.value, { stream: true });
      }
    }
  }
  assert.deepEqual(await readEvent(), created);

  const hash = `0x${randomBytes(32).toString("hex").toUpperCase()}`;
  await db.transaction(async (tx) => {
    const transfers = new ChainTransactionRepository(tx);
    const payments = PaymentRepository.forTransaction(tx);
    const ledger = new LedgerEntriesRepository(tx);
    const payouts = new PayoutRepository(tx);
    const receipts = new ReceiptRepository(tx);
    const audit = new AuditEventRepository(tx);
    const payment = await payments.lockPayment({ paymentId: created.id });
    const detected = { paymentId: payment.id, txHash: hash, amount: created.requiredTokenAmount, blockNumber: 100n };
    const transfer = await transfers.insertDetected(detected);
    assert.ok(transfer);
    assert.equal(await transfers.insertDetected({ ...detected, txHash: hash.toLowerCase() }), null);
    assert.equal((await transfers.findByHash(hash))?.id, transfer.id);
    assert.deepEqual((await transfers.listUnconfirmed()).map(({ id }) => id).includes(transfer.id), true);
    assert.equal(await transfers.getConfirmedTotal(payment.id), "0");
    await transfers.recordConfirmations(transfer.id, 2, new Date());
    assert.equal(await transfers.recordConfirmations(transfer.id, 3, new Date()), null);
    assert.equal(await transfers.getConfirmedTotal(payment.id), created.requiredTokenAmount);
    await transfers.advanceCursor(payment.id, 100n);
    await transfers.advanceCursor(payment.id, 99n);
    assert.equal(await transfers.getCursor(payment.id), 100n);
    const entry = { paymentId: payment.id, idempotencyKey: hash.toLowerCase(), entryType: "TOKEN_RECEIVED", amount: created.requiredTokenAmount };
    assert.ok(await ledger.append(entry));
    assert.equal(await ledger.append(entry), null);
    const payout = { paymentId: payment.id, status: "PENDING", provider: "mock", ngnAmountKobo: payment.ngnAmountKobo };
    assert.ok(await payouts.insertOnce(payout));
    assert.equal(await payouts.insertOnce(payout), null);
    assert.ok(await payouts.updateStatus(payment.id, "PENDING", "SUCCEEDED", "mock-24"));
    assert.equal(await payouts.updateStatus(payment.id, "PENDING", "FAILED"), null);
    const receipt = {
      paymentId: payment.id, merchantSnapshot: { businessName: "Oya integration shop", accountNumber: "private" },
      tokenAmount: created.requiredTokenAmount, rate: created.lockedRate, ngnAmountKobo: payment.ngnAmountKobo,
      transactionHashes: [hash.toLowerCase()],
    };
    assert.ok(await receipts.insertOnce(receipt));
    assert.equal(await receipts.insertOnce(receipt), null);
    let current = payment;
    for (const nextStatus of ["CONFIRMING", "PAID", "PAYOUT_PENDING", "SETTLED"] as const) {
      await audit.append({ paymentId: current.id, oldStatus: current.status, newStatus: nextStatus, reason: "Integration transfer" });
      current = await payments.updatePaymentState({
        paymentId: current.id, expectedVersion: current.version, expectedStatus: current.status, nextStatus,
        receivedTokenAmount: created.requiredTokenAmount, updatedAt: new Date(),
      });
    }
  });
  const settled = await readEvent();
  assert.equal(settled.status, "SETTLED");
  assert.equal(settled.receiptAvailable, true);
  await reader.cancel();
  assert.deepEqual(await (await request("/payments", 201, { body, key, cookie })).json(), created);

  const transfers = await (await request(`${merchantPath}/transactions`, 200, { cookie })).json();
  assert.equal(transfers.items[0].blockNumber, "100");
  const audit = await (await request(`${merchantPath}/audit?limit=1`, 200, { cookie })).json();
  assert.ok(audit.nextCursor);
  const history = await (await request(`${merchantPath}/audit?limit=1&cursor=${audit.nextCursor}`, 200, { cookie })).json();
  assert.notEqual(history.items[0].id, audit.items[0].id);
  const ledger = await (await request(`${merchantPath}/ledger`, 200, { cookie })).json();
  assert.equal(ledger.items[0].entryType, "TOKEN_RECEIVED");
  const receipt: PaymentReceipt = await (await request(`${paymentPath}/receipt`, 200)).json();
  assert.deepEqual(await (await request(`${merchantPath}/receipt`, 200, { cookie })).json(), receipt);
  assert.equal(receipt.rate, created.lockedRate);
  assert.deepEqual(receipt.transactionHashes, [hash.toLowerCase()]);
  assert.equal(JSON.stringify(receipt).includes("private"), false);
  await request("/auth/logout", 204, { method: "POST", cookie });
  await request("/auth/session", 401, { cookie });
});
