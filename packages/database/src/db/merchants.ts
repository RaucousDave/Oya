import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export const merchants = pgTable("merchants", {
  id: text("id")
    .$defaultFn(() => crypto.randomUUID())
    .primaryKey()
    .unique()
    .notNull(),
  userId: text("user_id")
    .references(() => user.id)
    .notNull()
    .unique(),
  businessName: text("business_name").notNull(),
  bankCode: text("bank_code"),
  accountNumber: text("account_number"),
  accountName: text("account_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at"),
});

export type Merchant = typeof merchants.$inferSelect;
type MerchantInsert = typeof merchants.$inferInsert;

export type CreateMerchantInput = Pick<
  MerchantInsert,
  "businessName" | "bankCode" | "accountNumber" | "accountName"
> & {
  userId: string;
};

export type UpdateMerchantInput = {
  userId: string;
} & Partial<CreateMerchantInput>;
