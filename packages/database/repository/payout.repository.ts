import { and, eq } from "drizzle-orm";
import type { DatabaseExecutor } from "../src/executor";
import { NotFoundError } from "../src/errors";
import { payouts } from "../src/db/payouts";
import { PaymentRepository } from "./payment.repository";

export class PayoutRepository {
  constructor(
    private readonly db: DatabaseExecutor,
    private readonly paymentRepository: PaymentRepository = new PaymentRepository(db),
  ) {}

  async insertOnce(input: typeof payouts.$inferInsert) {
    const [payout] = await this.db.insert(payouts).values({ ...input, createdAt: input.createdAt ?? new Date() })
      .onConflictDoNothing({ target: payouts.paymentId }).returning();
    return payout ?? null;
  }

  async updateStatus(paymentId: string, expected: string, status: string, providerReference?: string) {
    const [payout] = await this.db.update(payouts).set({ status, providerReference, updatedAt: new Date() })
      .where(and(eq(payouts.paymentId, paymentId), eq(payouts.status, expected))).returning();
    return payout ?? null;
  }

  async findForPayment(paymentId: string) {
    const [payout] = await this.db.select().from(payouts).where(eq(payouts.paymentId, paymentId));
    return payout ?? null;
  }

  async getPayouts(paymentId: string, merchantId: string) {
    await this.paymentRepository.getMerchantPayment(paymentId, merchantId);
    const payout = await this.findForPayment(paymentId);
    if (!payout) throw new NotFoundError("No payout for this payment");

    return payout;
  }
}
