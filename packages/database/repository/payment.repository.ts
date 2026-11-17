import { and, desc, eq, gte, lt } from "drizzle-orm";
import { Database } from "../src/db";
import {
  CreatePaymentInput,
  payments,
  PaymentStatus,
} from "../src/db/payments";
import { chainTxs } from "../src/db/chain";

export class PaymentRepository {
  constructor(private readonly db: Database) {}

  // For creating a mock payment
  async makePayment(input: CreatePaymentInput) {
    const [payment] = await this.db
      .insert(payments)
      .values(input)
      .onConflictDoNothing()
      .returning();

    if (!payment) {
      const [existing] = await this.db
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.idempotencyKey, input.idempotencyKey),
            eq(payments.merchantId, input.merchantId),
          ),
        );

      return existing;
    }

    return payment;
  }

  // Get all payments for a single merchant, implements pagination for frontend
  async getMerchantPayments(
    merchantId: string,
    status?: PaymentStatus,
    from?: Date,
    limit?: number,
    offset?: number,
    to?: Date,
  ) {
    const allPayments = await this.db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.merchantId, merchantId),
          from ? gte(payments.createdAt, from) : undefined,
          to ? lt(payments.createdAt, to) : undefined,
          status ? eq(payments.status, status) : undefined,
        ),
      )
      .orderBy(desc(payments.createdAt), desc(payments.id))
      .limit(limit ?? 10)
      .offset(offset ?? 0);

    return allPayments;
  }

  // Get single payment
  async getMerchantPayment(paymentId: string, merchantId: string) {
    const [payment] = await this.db
      .select()
      .from(payments)
      .where(
        and(eq(payments.id, paymentId), eq(payments.merchantId, merchantId)),
      );

    if (!payment) throw new Error("No payment exists for this merchant");

    return payment;
  }

  // Get payment transactions
  async listTransactions(
    paymentId: string,
    merchantId: string,
    limit?: number,
    offset?: number,
  ) {
    await this.getMerchantPayment(paymentId, merchantId);

    return this.db
      .select()
      .from(chainTxs)
      .where(eq(chainTxs.paymentId, paymentId))
      .limit(limit ?? 10)
      .offset(offset ?? 0);
  }

  // Get payment payouts - payments with status of succeeded
}
