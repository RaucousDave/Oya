import { eq } from "drizzle-orm";
import { Database } from "../src/db";
import { ledgerEntries } from "../src/db/ledgerEntries";
import { PaymentRepository } from "./payment.repository";

export class LedgerEntries {
  constructor(
    private readonly db: Database,
    private paymentRepo: PaymentRepository,
  ) {}

  async getLedgerEntries(
    paymentId: string,
    merchantId: string,
    limit?: number,
  ) {
    await this.paymentRepo.getMerchantPayment(paymentId, merchantId);

    const [LedgerEntries] = await this.db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.paymentId, paymentId))
      .limit(limit ?? 20);

    return LedgerEntries;
  }
}
