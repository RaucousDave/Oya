import { and, asc, desc, eq, gt, gte, lt, or, sql } from "drizzle-orm";
import type { DatabaseExecutor, TransactionExecutor } from "../src/executor";
import { ConcurrentUpdateError, NotFoundError } from "../src/errors";
import { payments } from "../src/db/payments";
import { chainTxs } from "../src/db/chain";
import { merchants } from "../src/db/merchants";
import { receipts } from "../src/db/receipts";
import type {
  DepositAddressLookupInput, ExpiryCandidatesInput, IdempotencyLookupInput,
  InsertPaymentInput, ListMerchantPaymentsInput, OwnedPaymentInput,
  PaymentCursor, PaymentPage, PaymentPageInput, UpdatePaymentStateInput,
} from "../types/payment";

function validateLimit(limit = 20): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError("Limit must be an integer between 1 and 100");
  }
  return limit;
}

function validateDate(date: Date): void {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new TypeError("Expected a valid Date");
  }
}

function validateCursor(cursor?: PaymentCursor): void {
  if (!cursor) return;
  validateDate(cursor.timestamp);
  if (!cursor.id) throw new TypeError("Cursor must include an ID");
}

function page<T>(rows: T[], limit: number, cursorFor: (row: T) => PaymentCursor): PaymentPage<T> {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return { items, nextCursor: rows.length > limit && last ? cursorFor(last) : null };
}

export class PaymentRepository {
  private transactionBound = false;

  constructor(private readonly db: DatabaseExecutor) {}

  /**
   * Bind payment operations to an already-open transaction. Use this factory inside
   * db.transaction(), and use that same transaction for ledger/audit writes. The
   * returned repository must not escape the callback: locks live only until commit
   * or rollback. Guarded writes and row locks reject ordinary connection instances.
   */
  static forTransaction(tx: TransactionExecutor): PaymentRepository {
    const repository = new PaymentRepository(tx);
    repository.transactionBound = true;
    return repository;
  }

  /**
   * Insert a server-prepared request with zero received units and AWAITING_PAYMENT
   * status. Rates, deadlines, and the address must already be computed by services.
   * Database uniqueness errors intentionally propagate: an address/reference
   * conflict is not an idempotent replay. The caller owns atomic creation, address
   * assignment, original-response storage, and the initial audit event.
   */
  async insertPayment(input: InsertPaymentInput) {
    const now = input.createdAt ?? new Date();
    validateDate(now);
    const [payment] = await this.db.insert(payments).values({
      ...input,
      tokenAddress: input.tokenAddress.toLowerCase(),
      depositAddress: input.depositAddress.toLowerCase(),
      status: "AWAITING_PAYMENT",
      receivedTokenAmount: "0",
      version: 0,
      createdAt: now,
      updatedAt: now,
    }).returning();
    if (!payment) throw new Error("Payment creation returned no record");
    return payment;
  }

  /**
   * Find a payment by its merchant-scoped creation key, returning null when absent.
   * This is a lookup, not complete idempotency: services still need request
   * fingerprint comparison and the stored original response for safe replay.
   */
  async findByIdempotencyKey(input: IdempotencyLookupInput) {
    const [payment] = await this.db.select().from(payments).where(and(
      eq(payments.merchantId, input.merchantId),
      eq(payments.idempotencyKey, input.idempotencyKey),
    ));
    return payment ?? null;
  }

  /** Compatibility alias for the previous method name; shares all lookup semantics. */
  async findIdempotencyKey(input: IdempotencyLookupInput) {
    return this.findByIdempotencyKey(input);
  }

  /**
   * Fetch one owned payment. Both identifiers are included in the SQL predicate,
   * so a missing payment and another merchant's payment produce the same error.
   * The positional overload preserves existing receipt/payout/audit/ledger callers;
   * new callers should use the named input object and a session-derived merchant ID.
   */
  async getMerchantPayment(input: OwnedPaymentInput): Promise<typeof payments.$inferSelect>;
  async getMerchantPayment(paymentId: string, merchantId: string): Promise<typeof payments.$inferSelect>;
  async getMerchantPayment(input: OwnedPaymentInput | string, merchantId?: string) {
    const owned = typeof input === "string" ? { paymentId: input, merchantId } : input;
    if (!owned.merchantId) throw new NotFoundError("Payment not found");
    const [payment] = await this.db.select().from(payments).where(and(
      eq(payments.id, owned.paymentId), eq(payments.merchantId, owned.merchantId),
    ));
    if (!payment) throw new NotFoundError("Payment not found");
    return payment;
  }

  /**
   * List a merchant's payments with optional status and [from, to) creation dates.
   * Descending timestamp/ID keyset pagination keeps tied timestamps deterministic.
   * Fetch one extra row solely to detect another page; return at most limit items.
   * Cursors are structured values here; HTTP code validates/encodes opaque cursors.
   */
  async listMerchantPayments(input: ListMerchantPaymentsInput) {
    const limit = validateLimit(input.limit);
    validateCursor(input.cursor);
    if (input.from) validateDate(input.from);
    if (input.to) validateDate(input.to);
    if (input.from && input.to && input.from >= input.to) {
      throw new RangeError("from must be earlier than to");
    }
    const rows = await this.db.select().from(payments).where(and(
      eq(payments.merchantId, input.merchantId),
      input.status ? eq(payments.status, input.status) : undefined,
      input.from ? gte(payments.createdAt, input.from) : undefined,
      input.to ? lt(payments.createdAt, input.to) : undefined,
      input.cursor ? or(
        lt(payments.createdAt, input.cursor.timestamp),
        and(eq(payments.createdAt, input.cursor.timestamp), lt(payments.id, input.cursor.id)),
      ) : undefined,
    )).orderBy(desc(payments.createdAt), desc(payments.id)).limit(limit + 1);
    return page(rows, limit, (row) => ({ timestamp: row.createdAt, id: row.id }));
  }

  /**
   * Return only customer-safe persisted checkout fields for an unguessable payment
   * ID. Banking details, auth IDs, idempotency keys, and internal version are never
   * selected. A receipt is available only for SETTLED payments with a receipt row.
   * API code adds configured token symbol/confirmation threshold, computes remaining
   * units, generates QR/URL fields, and serializes bigint and Date values.
   */
  async getCheckoutPayment(input: { paymentId: string }) {
    const [payment] = await this.db.select({
      id: payments.id,
      reference: payments.reference,
      merchant: { businessName: merchants.businessName },
      ngnAmountKobo: payments.ngnAmountKobo,
      requiredTokenAmount: payments.requiredTokenAmount,
      receivedTokenAmount: payments.receivedTokenAmount,
      token: { address: payments.tokenAddress, decimals: payments.tokenDecimals },
      chainId: payments.chainId,
      lockedRate: payments.lockedRateNumeric,
      rateExpiresAt: payments.rateExpiresAt,
      topUpExpiresAt: payments.topUpExpiresAt,
      depositAddress: payments.depositAddress,
      status: payments.status,
      receiptAvailable: sql<boolean>`${payments.status} = 'SETTLED' and ${receipts.id} is not null`,
      createdAt: payments.createdAt,
      updatedAt: payments.updatedAt,
    }).from(payments)
      .innerJoin(merchants, eq(payments.merchantId, merchants.id))
      .leftJoin(receipts, eq(receipts.paymentId, payments.id))
      .where(eq(payments.id, input.paymentId));
    if (!payment) throw new NotFoundError("Payment not found");
    return payment;
  }

  /**
   * Internal worker lookup with no merchant authorization. Returns null when absent.
   * Protected API routes must use getMerchantPayment instead; public routes must
   * use the restricted checkout projection rather than exposing this complete row.
   */
  async findPaymentById(input: { paymentId: string }) {
    const [payment] = await this.db.select().from(payments).where(eq(payments.id, input.paymentId));
    return payment ?? null;
  }

  /**
   * Associate a transfer with its expected chain, token, and deposit address together.
   * Case-insensitive address matching also supports mixed-case rows inserted before
   * normalization was introduced. This does not validate transfer amount, timing,
   * confirmation depth, or eligibility; the worker/domain layer owns those rules.
   */
  async findByDepositAddress(input: DepositAddressLookupInput) {
    const [payment] = await this.db.select().from(payments).where(and(
      eq(payments.chainId, input.chainId),
      sql`lower(${payments.tokenAddress}) = ${input.tokenAddress.toLowerCase()}`,
      sql`lower(${payments.depositAddress}) = ${input.depositAddress.toLowerCase()}`,
    ));
    return payment ?? null;
  }

  /**
   * Return a bounded, ascending-ID batch of expiry candidates: unpaid awaiting
   * requests after rate expiry, or UNDERPAID requests after the top-up grace period.
   * Equality remains inside the valid window, matching domain expiry comparisons.
   * Never expire CONFIRMING/terminal rows here. The worker must lock and recheck
   * candidates, including newly detected transfers, before deciding to expire them.
   * Restart afterId from the beginning after each sweep to discover newly due rows.
   */
  async listPaymentsDueForExpiry(input: ExpiryCandidatesInput) {
    validateDate(input.now);
    const limit = validateLimit(input.limit);
    return this.db.select().from(payments).where(and(
      input.afterId ? gt(payments.id, input.afterId) : undefined,
      or(
        and(eq(payments.status, "AWAITING_PAYMENT"), lt(payments.rateExpiresAt, input.now)),
        and(eq(payments.status, "UNDERPAID"), lt(payments.topUpExpiresAt, input.now)),
      ),
    )).orderBy(asc(payments.id)).limit(limit);
  }

  /**
   * Acquire a payment row lock until the current transaction ends. Construct this
   * instance with forTransaction(tx); standalone calls fail before executing SQL.
   * Lock before reading related transfers/evaluating transitions, and keep all
   * financial/audit writes in that transaction with a consistent lock order.
   */
  async lockPayment(input: { paymentId: string }) {
    this.requireTransaction();
    const [payment] = await this.db.select().from(payments)
      .where(eq(payments.id, input.paymentId)).for("update");
    if (!payment) throw new NotFoundError("Payment not found");
    return payment;
  }

  /**
   * Persist a domain-approved transition and confirmed received total atomically,
   * incrementing version only if both the expected version and status still match.
   * A stale/missing row raises ConcurrentUpdateError instead of silently succeeding.
   * Requires forTransaction(tx): the caller must validate the transition through
   * @oya/domain and append its audit/ledger effects using tx before committing.
   * This method performs no provider calls and emits no realtime notifications.
   */
  async updatePaymentState(input: UpdatePaymentStateInput) {
    this.requireTransaction();
    validateDate(input.updatedAt);
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) {
      throw new RangeError("Expected version must be a nonnegative safe integer");
    }
    if (!/^(0|[1-9][0-9]{0,77})$/.test(input.receivedTokenAmount)) {
      throw new TypeError("Received amount must be a nonnegative integer of at most 78 digits");
    }
    const [payment] = await this.db.update(payments).set({
      status: input.nextStatus,
      receivedTokenAmount: input.receivedTokenAmount,
      updatedAt: input.updatedAt,
      version: sql`${payments.version} + 1`,
    }).where(and(
      eq(payments.id, input.paymentId),
      eq(payments.version, input.expectedVersion),
      eq(payments.status, input.expectedStatus),
    )).returning();
    if (!payment) throw new ConcurrentUpdateError("Payment changed or is missing; reload before retrying");
    return payment;
  }

  /**
   * List transfers only after checking merchant ownership on the same executor.
   * Order by detection time and ID and return a bounded page, never an unscoped
   * transfer list. The migration makes detection timestamps non-null so every row
   * has a usable cursor. This method can later move to ChainTransactionRepository.
   */
  async listTransactions(input: OwnedPaymentInput & PaymentPageInput) {
    const limit = validateLimit(input.limit);
    validateCursor(input.cursor);
    await this.getMerchantPayment(input);
    const rows = await this.db.select().from(chainTxs).where(and(
      eq(chainTxs.paymentId, input.paymentId),
      input.cursor ? or(
        lt(chainTxs.detectedAt, input.cursor.timestamp),
        and(eq(chainTxs.detectedAt, input.cursor.timestamp), lt(chainTxs.id, input.cursor.id)),
      ) : undefined,
    )).orderBy(desc(chainTxs.detectedAt), desc(chainTxs.id)).limit(limit + 1);
    return page(rows, limit, (row) => ({ timestamp: row.detectedAt, id: row.id }));
  }

  /** Reject transaction-only operations before SQL can acquire a short-lived autocommit lock. */
  private requireTransaction(): void {
    if (!this.transactionBound) throw new Error("Use PaymentRepository.forTransaction(tx) inside a transaction");
  }
}

export type CheckoutPaymentView = Awaited<ReturnType<PaymentRepository["getCheckoutPayment"]>>;
