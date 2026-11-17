import { eq, or, lt, and, desc } from "drizzle-orm";
import { Database } from "../src/db";
import { ledgerEntries } from "../src/db/ledgerEntries";
import { PaymentRepository } from "./payment.repository";

export class LedgerEntriesRepository {
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

    const LedgerEntries = await this.db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.paymentId, paymentId))
      .limit(limit ?? 20);

    return LedgerEntries;
  }

  async listLedgerEntries(
    paymentId: string,
    merchantId: string,
    limit = 20,
    cursor?: { createdAt: Date; id: string },
  ) {
    await this.paymentRepo.getMerchantPayment(paymentId, merchantId);
    const rows = await this.db
      .select()
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.paymentId, paymentId),
          cursor
            ? or(
                lt(ledgerEntries.createdAt, cursor.createdAt),
                and(
                  eq(ledgerEntries.createdAt, cursor.createdAt),
                  lt(ledgerEntries.id, cursor.id),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(desc(ledgerEntries.createdAt), desc(ledgerEntries.id))
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
