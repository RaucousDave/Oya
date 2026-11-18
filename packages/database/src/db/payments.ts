import {
  bigint,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
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
  "FAILED",
  "REFUNDED",
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
    reference: text("reference").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
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

    version: integer("version").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at"),
  },
  (t) => [
    index("payments_merchant_id_idx").on(t.merchantId),
    unique("payments_idempotency_key_idx").on(t.merchantId, t.idempotencyKey),
    unique("payments_reference_idx").on(t.reference, t.merchantId),
  ],
);

export type Payments = typeof payments.$inferSelect;

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
  reference: string;
  idempotencyKey: string;
  topUpExpiresAt: Date;
  depositAddress: string;
  status: PaymentStatus;
};

export type PaymentInsertStatus = Omit<
  CreatePaymentInput,
  "status" | "receivedTokenAmount"
>;
