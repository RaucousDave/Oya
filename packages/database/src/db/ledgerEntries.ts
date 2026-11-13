import {
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { payments } from "./payments";

export const ledgerEntries = pgTable("ledger_entries", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  paymentId: text("payment_id").references(() => payments.id),
  entryType: text("entry_type"),
  amount: numeric("amount", {
    precision: 78,
    scale: 0,
  }),
  assetCode: text("asset_code"),
  assetDecimals: integer("asset_decimals"),
  chainId: integer("chain_id"),
  tokenAddress: text("token_address"),
  idempotencyKey: text("idempotency_key").unique(),
  createdAt: timestamp("created_at"),
});
