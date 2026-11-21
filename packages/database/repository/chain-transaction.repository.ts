import { and, asc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { chainCursors, chainTxs } from "../src/db/chain";
import type { DatabaseExecutor } from "../src/executor";

type Transfer = typeof chainTxs.$inferInsert;
type DetectedTransfer = Pick<Transfer, "paymentId" | "detectedAt"> & {
  txHash: string;
  amount: string;
  blockNumber: bigint;
};

export class ChainTransactionRepository {
  constructor(private readonly db: DatabaseExecutor) {}

  async insertDetected(input: DetectedTransfer) {
    const [transfer] = await this.db.insert(chainTxs)
      .values({ ...input, txHash: input.txHash.toLowerCase(), confirmations: 0 })
      .onConflictDoNothing({ target: chainTxs.txHash }).returning();
    return transfer ?? null;
  }

  async findByHash(hash: string) {
    const [transfer] = await this.db.select().from(chainTxs)
      .where(eq(chainTxs.txHash, hash.toLowerCase()));
    return transfer ?? null;
  }

  async listUnconfirmed(limit = 100, afterId?: string) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
      throw new RangeError("Limit must be between 1 and 1000");
    }
    return this.db.select().from(chainTxs).where(and(
      isNull(chainTxs.confirmedAt), afterId ? gt(chainTxs.id, afterId) : undefined,
    )).orderBy(asc(chainTxs.id)).limit(limit);
  }

  async recordConfirmations(id: string, confirmations: number, confirmedAt?: Date) {
    if (!Number.isSafeInteger(confirmations) || confirmations < 0 || confirmations > 2147483647) {
      throw new RangeError("Invalid confirmation count");
    }
    const [transfer] = await this.db.update(chainTxs)
      .set({ confirmations: sql`greatest(${chainTxs.confirmations}, ${confirmations})`, confirmedAt })
      .where(and(eq(chainTxs.id, id), isNull(chainTxs.confirmedAt))).returning();
    return transfer ?? null;
  }

  async getConfirmedTotal(paymentId: string) {
    const [row] = await this.db.select({ total: sql<string>`coalesce(sum(${chainTxs.amount}), 0)::text` })
      .from(chainTxs).where(and(eq(chainTxs.paymentId, paymentId), sql`${chainTxs.confirmedAt} is not null`));
    return row?.total ?? "0";
  }

  async getCursor(key: string) {
    const [row] = await this.db.select().from(chainCursors).where(eq(chainCursors.key, key));
    return row?.blockNumber ?? null;
  }

  // Use after recording all transfers from a contiguous range in the same transaction.
  async advanceCursor(key: string, blockNumber: bigint) {
    await this.db.insert(chainCursors).values({ key, blockNumber }).onConflictDoUpdate({
      target: chainCursors.key, set: { blockNumber }, setWhere: lt(chainCursors.blockNumber, blockNumber),
    });
  }
}
