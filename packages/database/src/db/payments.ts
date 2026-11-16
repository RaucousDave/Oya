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
  "AWAITING_PAYMENT",
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
    merchantId: text("merchant_id")
      .references(() => merchants.id)
      .notNull(),
    ngnAmountKobo: bigint("ngn_amount_kobo", { mode: "bigint" }).notNull(),
    requiredTokenAmount: numeric("required_token_amount", {
      precision: 78,
      scale: 0,
    }).notNull(),
    receivedTokenAmount: numeric("received_token_amount", {
      precision: 78,
      scale: 0,
    }).notNull(),
    tokenAddress: text("token_address").notNull(),
    tokenDecimals: integer("token_decimals").notNull(),
    chainId: integer("chain_id").notNull(),
    lockedRateNumeric: numeric("locked_rate_numeric", {
      precision: 20,
      scale: 8,
    }).notNull(),
    rateExpiresAt: timestamp("rate_expires_at").notNull(),
    topUpExpiresAt: timestamp("top_up_expires_at").notNull(),
    depositAddress: text("deposit_address").unique().notNull(),
    status: paymentStatusEnum("status").notNull(),

    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at"),
  },
  (t) => [index("payments_merchant_id_idx").on(t.merchantId)],
);

export type Payments = typeof payments.$inferSelect;
type PaymentInsert = typeof payments.$inferInsert;

export type PaymentStatus = (typeof payments.$inferInsert)["status"];

export type CreatePaymentInput = {
  merchantId: string;
  ngnAmountKobo: bigint;
  requiredTokenAmount: string;
  receivedTokenAmount: string;
  tokenAddress: string;
  tokenDecimals: number;
  chainId: number;
  lockedRateNumeric: string;
  rateExpiresAt: Date;
  topUpExpiresAt: Date;
  depositAddress: string;
  status: PaymentStatus;
};
