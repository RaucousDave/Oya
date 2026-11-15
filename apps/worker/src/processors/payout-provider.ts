export interface PayoutInput {
  idempotencyKey: string;
  paymentId: string;
  merchantId: string;
  amountKobo: bigint;
}

export type PayoutStatus = "COMPLETED";

export interface PayoutResult {
  provider: string;
  providerReference: string;
  status: PayoutStatus;
}

export interface PayoutProvider {
  createPayout(input: PayoutInput): Promise<PayoutResult>;
}
