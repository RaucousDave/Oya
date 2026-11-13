import {
  bigint,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { merchants } from "./merchants";

export const paymentStatusEnum = pgEnum("paymentStatus", [
  "CREATED",
  "AWAITNG_PAYMENT",
  "CONFIRMING",
  "PAID",
  "PAYOUT_PENDING",
  "SETTLED",
  "EXPIRED",
  "UNDERPAID",
  "OVERPAID",
  "WRONG_NETWORK_FLAGGED",
]);

export const payments = pgTable(
  "payments",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    merchantId: text("merchant_id").references(() => merchants.id),
    ngnAmountKobo: bigint("ngn_amount_kobo", { mode: "number" }),
    requiredTokenAmount: numeric("required_token_amount", {
      precision: 78,
      scale: 0,
    }).notNull(),
    receivedTokenAmount: numeric("received_token_amount", {
      precision: 78,
      scale: 0,
    }).notNull(),
    tokenAddress: text("token_address"),
    tokenDecimals: integer("token_decimals"),
    chainId: integer("chain_id"),
    lockedRateNumeric: numeric("locked_rate_numeric", {
      precision: 20,
      scale: 8,
    }),
    rateExpiresAt: timestamp("rate_expires_at"),
    topUpExpiresAt: timestamp("top_up_expires_at"),
    depositAddress: text("deposit_address").unique(),
    status: paymentStatusEnum("status"),

    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at"),
  },
  (t) => [index("payments_merchant_id_idx").on(t.merchantId)],
);
