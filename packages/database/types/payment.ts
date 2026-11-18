import type { PaymentInsertStatus, PaymentStatus } from "../src/db/payments";

export type PaymentCursor = {
  timestamp: Date;
  id: string;
};

export type ListMerchantPaymentsInput = {
  merchantId: string;
  status?: PaymentStatus;
  from?: Date;
  to?: Date;
  limit?: number;
  cursor?: PaymentCursor;
};

export type OwnedPaymentInput = { paymentId: string; merchantId: string };
export type PaymentPageInput = { limit?: number; cursor?: PaymentCursor };
export type PaymentPage<T> = { items: T[]; nextCursor: PaymentCursor | null };
export type InsertPaymentInput = PaymentInsertStatus & { id?: string; createdAt?: Date };
export type IdempotencyLookupInput = { merchantId: string; idempotencyKey: string };
export type DepositAddressLookupInput = {
  chainId: number;
  tokenAddress: string;
  depositAddress: string;
};
export type ExpiryCandidatesInput = { now: Date; limit: number; afterId?: string };
export type UpdatePaymentStateInput = {
  paymentId: string;
  expectedVersion: number;
  expectedStatus: PaymentStatus;
  nextStatus: PaymentStatus;
  receivedTokenAmount: string;
  updatedAt: Date;
};
