import { eq } from "drizzle-orm";
import { Database } from "../src/db";
import { payouts } from "../src/db/payouts";
import { PaymentRepository } from "./payment.repository";

export class PayoutRepository {
  constructor(
    private readonly db: Database,
    private readonly paymentRepository: PaymentRepository,
  ) {}

  async getPayouts(paymentId: string, merchantId: string) {
    await this.paymentRepository.getMerchantPayment(paymentId, merchantId);
    const [payout] = await this.db
      .select()
      .from(payouts)
      .where(eq(payouts.paymentId, paymentId));

    if (!payout) throw new Error("No payout for this payment");

    return payout;
  }
}
