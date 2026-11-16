import { eq } from "drizzle-orm";
import { Database } from "../src/db";
import { receipts } from "../src/db/receipts";
import { PaymentRepository } from "./payment.repository";

export class ReceiptRepository {
  constructor(
    private readonly db: Database,
    private readonly paymentRepo: PaymentRepository,
  ) {}

  async getReceipt(merchantId: string, paymentId: string) {
    await this.paymentRepo.getMerchantPayment(paymentId, merchantId);

    const [receipt] = await this.db
      .select()
      .from(receipts)
      .where(eq(receipts.paymentId, paymentId));

    if (!receipt)
      throw new Error("No receipt for this payment has been created yet");
  }
}
