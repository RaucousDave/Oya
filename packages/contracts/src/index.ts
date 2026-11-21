export const paymentStatuses = [
  "CREATED",
  "AWAITING_PAYMENT",
  "CONFIRMING",
  "UNDERPAID",
  "OVERPAID",
  "PAID",
  "PAYOUT_PENDING",
  "SETTLED",
  "EXPIRED",
  "WRONG_NETWORK_FLAGGED",
  "REFUNDED",
  "FAILED",
] as const;
export type PaymentStatus = (typeof paymentStatuses)[number];

export type MerchantSummary = { id: string; businessName: string };
export type PaymentSummary = {
  id: string;
  reference: string;
  description: string | null;
  ngnAmountKobo: string;
  status: PaymentStatus;
  createdAt: string;
};
export type CheckoutPayment = PaymentSummary & {
  merchant: { businessName: string };
  requiredTokenAmount: string;
  receivedTokenAmount: string;
  remainingTokenAmount: string;
  token: { address: string; decimals: number; symbol: string };
  chainId: number;
  lockedRate: string;
  rateExpiresAt: string;
  topUpExpiresAt: string;
  depositAddress: string;
  paymentUrl: string;
  qrPayload: string;
  requiredConfirmations: number;
  receiptAvailable: boolean;
};
export type CreatePaymentRequest = { amount: string; description?: string };
export type CursorPage<T> = { items: T[]; nextCursor: string | null };
export type MerchantPayments = CursorPage<PaymentSummary> & {
  totals: { today: string; week: string };
};
export type PaymentFilters = { status?: PaymentStatus; from?: string; to?: string; cursor?: string };
export type ChainTransaction = {
  id: string;
  txHash: string | null;
  amount: string | null;
  blockNumber: string | null;
  confirmations: number | null;
  detectedAt: string;
  confirmedAt: string | null;
};
export type PaymentAuditEvent = {
  id: string;
  oldStatus: PaymentStatus | null;
  newStatus: PaymentStatus | null;
  reason: string | null;
  createdAt: string | null;
};
export type PaymentLedgerEntry = {
  id: string;
  entryType: string | null;
  amount: string | null;
  assetCode: string | null;
  assetDecimals: number | null;
  createdAt: string | null;
};
export type PaymentPayout = {
  status: string | null;
  ngnAmountKobo: string | null;
  provider: string | null;
  providerReference: string | null;
};
export type MerchantPayment = {
  payment: CheckoutPayment;
  transactions: CursorPage<ChainTransaction>;
  audit: CursorPage<PaymentAuditEvent>;
  ledger: CursorPage<PaymentLedgerEntry>;
  payout: PaymentPayout | null;
};
export type PaymentReceipt = {
  id: string;
  paymentId: string;
  merchantName: string | null;
  ngnAmountKobo: string | null;
  tokenAmount: string | null;
  tokenDecimals: number;
  rate: string | null;
  transactionHashes: string[];
  createdAt: string | null;
};
export type PaymentEvent = CheckoutPayment;
export type ApiError = { statusCode: number; message: string };
