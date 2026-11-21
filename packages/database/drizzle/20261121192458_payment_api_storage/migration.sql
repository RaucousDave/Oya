CREATE SEQUENCE "deposit_address_index" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "chain_cursors" (
	"key" text PRIMARY KEY,
	"block_number" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "receipts" ALTER COLUMN "rate" SET DATA TYPE numeric(36,8) USING "rate"::numeric(36,8);
