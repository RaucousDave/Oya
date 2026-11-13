import {
  bigint,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { payments } from "./payments";

export const chainTxs = pgTable(
  "chain_txs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    paymentId: text("payment_id")
      .references(() => payments.id)
      .notNull(),
    txHash: text("tx_hash").unique(),
    amount: numeric("amount", {
      precision: 78,
      scale: 0,
    }),
    blockNumber: bigint("block_number", { mode: "bigint" }),
    confirmations: integer("confirmations"),
    detectedAt: timestamp("detected_at"),
    confirmedAt: timestamp("confirmed_at"),
  },
  (t) => [
    index("chain_txs_payment_id_idx").on(t.paymentId),
    uniqueIndex("chain_txs_hash_log_idx").on(t.txHash),
  ],
);
