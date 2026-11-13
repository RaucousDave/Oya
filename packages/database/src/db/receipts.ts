import {
  bigint,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { payments } from "./payments";

export const receipts = pgTable(
  "receipts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    paymentId: text("payment_id")
      .references(() => payments.id)
      .unique()
      .notNull(),

    merchantSnapshot: jsonb("merchant_snapshot"),
    ngnAmountKobo: bigint("ngn_amount_kobo", { mode: "bigint" }),
    tokenAmount: numeric("token_amount", {
      precision: 78,
      scale: 0,
    }),
    rate: numeric("rate", {
      precision: 28,
      scale: 0,
    }),
    transactionHashes: jsonb("transaction_hashes"),
    createdAt: timestamp("created_at"),
  },
  (t) => [uniqueIndex("payment_id_idx").on(t.paymentId)],
);
