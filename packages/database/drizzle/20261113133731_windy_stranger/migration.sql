ALTER TABLE "audit_events" ALTER COLUMN "payment_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "chain_txs" ALTER COLUMN "payment_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payouts" ALTER COLUMN "payment_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "receipts" ALTER COLUMN "payment_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ledger_entries" ALTER COLUMN "payment_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_user_id_key" UNIQUE("user_id");