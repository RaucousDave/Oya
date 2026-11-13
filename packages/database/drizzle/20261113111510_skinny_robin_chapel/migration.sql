CREATE TYPE "paymentStatus" AS ENUM('CREATED', 'AWAITNG_PAYMENT', 'CONFIRMING', 'PAID', 'PAYOUT_PENDING', 'SETTLED', 'EXPIRED', 'UNDERPAID', 'OVERPAID', 'WRONG_NETWORK_FLAGGED');--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY,
	"payment_id" text,
	"old_status" "paymentStatus",
	"new_status" "paymentStatus",
	"reason" text,
	"metadata" jsonb,
	"created_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "chain_txs" (
	"id" text PRIMARY KEY,
	"payment_id" text,
	"tx_hash" text UNIQUE,
	"amount" numeric(78,0),
	"block_number" bigint,
	"confirmations" integer,
	"detected_at" timestamp,
	"confirmed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" text PRIMARY KEY UNIQUE,
	"user_id" text,
	"business_name" text NOT NULL,
	"bank_code" text,
	"account_number" text,
	"account_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY,
	"merchant_id" text,
	"ngn_amount_kobo" bigint,
	"required_token_amount" numeric(78,0) NOT NULL,
	"received_token_amount" numeric(78,0) NOT NULL,
	"token_address" text,
	"token_decimals" integer,
	"chain_id" integer,
	"locked_rate_numeric" numeric(20,8),
	"rate_expires_at" timestamp,
	"top_up_expires_at" timestamp,
	"deposit_address" text UNIQUE,
	"status" "paymentStatus",
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" text PRIMARY KEY,
	"payment_id" text UNIQUE,
	"ngn_amount_kobo" bigint,
	"status" text,
	"provider" text,
	"provider_reference" text,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" text PRIMARY KEY,
	"payment_id" text UNIQUE,
	"merchant_snapshot" jsonb,
	"ngn_amount_kobo" bigint,
	"token_amount" numeric(78,0),
	"rate" numeric(28,0),
	"transaction_hashes" jsonb,
	"created_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" text PRIMARY KEY,
	"payment_id" text,
	"entry_type" text,
	"amount" numeric(78,0),
	"asset_code" text,
	"asset_decimals" integer,
	"chain_id" integer,
	"token_address" text,
	"idempotency_key" text UNIQUE,
	"created_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL UNIQUE,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"email_verified" boolean NOT NULL,
	"image" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE INDEX "chain_txs_payment_id_idx" ON "chain_txs" ("payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chain_txs_hash_log_idx" ON "chain_txs" ("tx_hash");--> statement-breakpoint
CREATE INDEX "payments_merchant_id_idx" ON "payments" ("merchant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_id_idx" ON "receipts" ("payment_id");--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_payment_id_payments_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id");--> statement-breakpoint
ALTER TABLE "chain_txs" ADD CONSTRAINT "chain_txs_payment_id_payments_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id");--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_merchant_id_merchants_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id");--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_payment_id_payments_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id");--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_payment_id_payments_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id");--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_payment_id_payments_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id");--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;