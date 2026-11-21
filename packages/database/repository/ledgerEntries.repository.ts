import { eq, and, desc } from "drizzle-orm";
import type { DatabaseExecutor } from "../src/executor";
import { ledgerEntries } from "../src/db/ledgerEntries";
import { beforeCursor, missingTimestamp, orderedTimestamp, validateLimit } from "./pagination";
import { PaymentRepository } from "./payment.repository";

export class LedgerEntriesRepository {
  constructor(
    private readonly db: DatabaseExecutor,
    private readonly paymentRepo: PaymentRepository = new PaymentRepository(db),
  ) {}

  async append(input: typeof ledgerEntries.$inferInsert & { idempotencyKey: string }) {
    const [entry] = await this.db.insert(ledgerEntries)
      .values({ ...input, createdAt: input.createdAt ?? new Date() })
      .onConflictDoNothing({ target: ledgerEntries.idempotencyKey }).returning();
    return entry ?? null;
  }

  async getLedgerEntries(
    paymentId: string,
    merchantId: string,
    limit?: number,
  ) {
    await this.paymentRepo.getMerchantPayment(paymentId, merchantId);

    const LedgerEntries = await this.db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.paymentId, paymentId))
      .orderBy(desc(orderedTimestamp(ledgerEntries.createdAt)), desc(ledgerEntries.id))
      .limit(validateLimit(limit));

    return LedgerEntries;
  }

  async listLedgerEntries(
    paymentId: string,
    merchantId: string,
    limit = 20,
    cursor?: { createdAt: Date; id: string },
  ) {
    await this.paymentRepo.getMerchantPayment(paymentId, merchantId);
    validateLimit(limit);
    const timestamp = orderedTimestamp(ledgerEntries.createdAt);
    const rows = await this.db
      .select()
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.paymentId, paymentId),
          beforeCursor(timestamp, ledgerEntries.id, cursor && { timestamp: cursor.createdAt, id: cursor.id }),
        ),
      )
      .orderBy(desc(timestamp), desc(ledgerEntries.id))
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
