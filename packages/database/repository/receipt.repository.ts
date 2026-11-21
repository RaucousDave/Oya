import { and, eq, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "../src/executor";
import { NotFoundError } from "../src/errors";
import { payments } from "../src/db/payments";
import { receipts } from "../src/db/receipts";
import { PaymentRepository } from "./payment.repository";

export class ReceiptRepository {
  constructor(
    private readonly db: DatabaseExecutor,
    private readonly paymentRepo: PaymentRepository = new PaymentRepository(db),
  ) {}

  async insertOnce(input: typeof receipts.$inferInsert) {
    const [receipt] = await this.db.insert(receipts).values({ ...input, createdAt: input.createdAt ?? new Date() })
      .onConflictDoNothing({ target: receipts.paymentId }).returning();
    return receipt ?? null;
  }

  async getCheckoutReceipt(paymentId: string) {
    const [row] = await this.db.select({
      id: receipts.id, paymentId: receipts.paymentId, ngnAmountKobo: receipts.ngnAmountKobo,
      tokenAmount: receipts.tokenAmount, rate: receipts.rate,
      transactionHashes: receipts.transactionHashes, createdAt: receipts.createdAt,
      merchantName: sql<string | null>`${receipts.merchantSnapshot}->>'businessName'`,
      tokenDecimals: payments.tokenDecimals,
    }).from(receipts).innerJoin(payments, eq(payments.id, receipts.paymentId))
      .where(and(eq(receipts.paymentId, paymentId), eq(payments.status, "SETTLED")));
    if (!row) throw new NotFoundError("Receipt not available");
    return row;
  }

  async getReceipt(merchantId: string, paymentId: string) {
    await this.paymentRepo.getMerchantPayment(paymentId, merchantId);

    const [receipt] = await this.db
      .select()
      .from(receipts)
      .where(eq(receipts.paymentId, paymentId));

    if (!receipt)
      throw new NotFoundError("No receipt for this payment has been created yet");

    return receipt;
  }
}
