import { eq, or, lt, and, desc } from "drizzle-orm";
import { Database } from "../src/db";
import { auditEvents } from "../src/db/auditEvents";
import { PaymentRepository } from "./payment.repository";

export class AuditEventRepository {
  constructor(
    private readonly db: Database,
    private readonly paymentRepo: PaymentRepository,
  ) {}

  // Enienghan

  async getAuditEvents(
    paymentId: string,
    merchantId: string,
    limit = 20,
    cursor?: { createdAt: Date; id: string },
  ) {
    await this.paymentRepo.getMerchantPayment(paymentId, merchantId);

    const rows = await this.db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.paymentId, paymentId),
          cursor
            ? or(
                lt(auditEvents.createdAt, cursor.createdAt),
                and(
                  eq(auditEvents.createdAt, cursor.createdAt),
                  lt(auditEvents.id, cursor.id),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];

    return {
      items,
      nextCursor: hasMore ? { createdAt: last.createdAt, id: last.id } : null,
    };
  }
}
