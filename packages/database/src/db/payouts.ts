import { bigint, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { payments } from "./payments";

export const payouts = pgTable("payouts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  paymentId: text("payment_id")
    .references(() => payments.id)
    .unique()
    .notNull(),
  ngnAmountKobo: bigint("ngn_amount_kobo", { mode: "bigint" }),
  status: text("status"),
  provider: text("provider"),
  providerReference: text("provider_reference"),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});
