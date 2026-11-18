ALTER TYPE "paymentStatus" ADD VALUE 'FAILED';--> statement-breakpoint
ALTER TYPE "paymentStatus" ADD VALUE 'REFUNDED';--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "chain_txs" ALTER COLUMN "detected_at" SET DEFAULT now();--> statement-breakpoint
-- Historical detection times cannot be recovered; prefer confirmation time when known.
UPDATE "chain_txs" SET "detected_at" = COALESCE("confirmed_at", now()) WHERE "detected_at" IS NULL;--> statement-breakpoint
ALTER TABLE "chain_txs" ALTER COLUMN "detected_at" SET NOT NULL;--> statement-breakpoint
-- Existing requests use the MVP's sixty-second rate window.
UPDATE "payments" SET "created_at" = "rate_expires_at" - interval '60 seconds' WHERE "created_at" IS NULL;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "created_at" SET NOT NULL;
