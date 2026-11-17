ALTER TABLE "payments" ADD COLUMN "reference" text NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "idempotency_key" text NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_events" ALTER COLUMN "old_status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "audit_events" ALTER COLUMN "new_status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "paymentStatus";--> statement-breakpoint
CREATE TYPE "paymentStatus" AS ENUM('CREATED', 'AWAITING_PAYMENT', 'CONFIRMING', 'PAID', 'PAYOUT_PENDING', 'SETTLED', 'EXPIRED', 'UNDERPAID', 'OVERPAID', 'WRONG_NETWORK_FLAGGED');--> statement-breakpoint
ALTER TABLE "audit_events" ALTER COLUMN "old_status" SET DATA TYPE "paymentStatus" USING "old_status"::"paymentStatus";--> statement-breakpoint
ALTER TABLE "audit_events" ALTER COLUMN "new_status" SET DATA TYPE "paymentStatus" USING "new_status"::"paymentStatus";--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "status" SET DATA TYPE "paymentStatus" USING "status"::"paymentStatus";--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "merchant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "ngn_amount_kobo" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "token_address" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "token_decimals" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "chain_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "locked_rate_numeric" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "rate_expires_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "top_up_expires_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "deposit_address" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_idempotency_key_idx" UNIQUE("merchant_id","idempotency_key");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_reference_idx" UNIQUE("reference","merchant_id");