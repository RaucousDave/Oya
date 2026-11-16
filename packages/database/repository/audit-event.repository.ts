import { eq } from "drizzle-orm";
import { Database } from "../src/db";
import { auditEvents } from "../src/db/auditEvents";
import { PaymentRepository } from "./payment.repository";

export class AuditEventRepository {
  constructor(
    private readonly db: Database,
    private readonly paymentRepo: PaymentRepository,
  ) {}

  async getAuditEvents(paymentId: string, merchantId: string, limit?: number) {
    await this.paymentRepo.getMerchantPayment(paymentId, merchantId);

    const allAuditEvents = await this.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.paymentId, paymentId))
      .limit(limit ?? 20);

    return allAuditEvents;
  }
}
