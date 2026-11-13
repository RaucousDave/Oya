import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { payments, paymentStatusEnum } from "./payments";

export const auditEvents = pgTable("audit_events", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  paymentId: text("payment_id")
    .references(() => payments.id)
    .notNull(),
  oldStatus: paymentStatusEnum("old_status"),
  newStatus: paymentStatusEnum("new_status"),
  reason: text("reason"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at"),
});
