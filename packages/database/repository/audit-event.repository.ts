import { eq, and, desc } from "drizzle-orm";
import type { DatabaseExecutor } from "../src/executor";
import { auditEvents } from "../src/db/auditEvents";
import { beforeCursor, missingTimestamp, orderedTimestamp, validateLimit } from "./pagination";
import { PaymentRepository } from "./payment.repository";

export class AuditEventRepository {
  constructor(
    private readonly db: DatabaseExecutor,
    private readonly paymentRepo: PaymentRepository = new PaymentRepository(db),
  ) {}

  async append(input: typeof auditEvents.$inferInsert) {
    const [event] = await this.db.insert(auditEvents)
      .values({ ...input, createdAt: input.createdAt ?? new Date() }).returning();
    return event;
  }

  async getCreationMetadata(paymentId: string) {
    const [event] = await this.db.select({ metadata: auditEvents.metadata }).from(auditEvents)
      .where(and(eq(auditEvents.paymentId, paymentId), eq(auditEvents.oldStatus, "CREATED"),
        eq(auditEvents.newStatus, "AWAITING_PAYMENT"))).limit(1);
    return event?.metadata;
  }

  async getAuditEvents(
    paymentId: string,
    merchantId: string,
    limit = 20,
    cursor?: { createdAt: Date; id: string },
  ) {
    await this.paymentRepo.getMerchantPayment(paymentId, merchantId);

    validateLimit(limit);
    const timestamp = orderedTimestamp(auditEvents.createdAt);
    const rows = await this.db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.paymentId, paymentId),
          beforeCursor(timestamp, auditEvents.id, cursor && { timestamp: cursor.createdAt, id: cursor.id }),
        ),
      )
      .orderBy(desc(timestamp), desc(auditEvents.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];

    return {
      items,
      nextCursor: hasMore && last ? { createdAt: last.createdAt ?? missingTimestamp, id: last.id } : null,
    };
  }
}
