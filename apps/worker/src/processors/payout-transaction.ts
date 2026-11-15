import type { Hex } from "@oya/chain";
import type { PaymentStatus } from "@oya/contracts";
import type { PayoutStatus } from "./payout-provider.js";
import type { AuditEvent } from "./transfer-transaction.js";

export interface PayoutPayment {
  id: string;
  status: PaymentStatus;
  merchantId: string;
  ngnAmountKobo: bigint;
  tokenAmount: bigint;
  rate: string;
  txHashes: Hex[];
}

export interface PayoutCandidate {
  id: string;
  status: PaymentStatus;
}

export const payoutLedgerEntryTypes = ["MERCHANT_BALANCE", "PAYOUT"] as const;
export type PayoutLedgerEntryType =
  (typeof payoutLedgerEntryTypes)[number];

export interface PayoutLedgerEntry {
  paymentId: string;
  entryType: PayoutLedgerEntryType;
  amount: bigint;
  createdAt: Date;
}

export interface PayoutRecord {
  paymentId: string;
  amountKobo: bigint;
  status: PayoutStatus;
  provider: string;
  providerReference: string;
  createdAt: Date;
}

export interface ReceiptSnapshot {
  paymentId: string;
  merchantId: string;
  ngnAmountKobo: bigint;
  tokenAmount: bigint;
  rate: string;
  txHashes: Hex[];
  createdAt: Date;
}

export interface PayoutTransaction {
  findPayment(paymentId: string): Promise<PayoutPayment | null>;
  updatePaymentStatus(
    paymentId: string,
    status: PaymentStatus,
  ): Promise<void>;
  insertPayout(payout: PayoutRecord): Promise<void>;
  insertLedgerEntry(entry: PayoutLedgerEntry): Promise<void>;
  insertReceipt(receipt: ReceiptSnapshot): Promise<void>;
  insertAuditEvent(event: AuditEvent): Promise<void>;
}

export interface PayoutTransactionReader {
  findPaymentsByStatuses(
    statuses: readonly PaymentStatus[],
  ): Promise<PayoutCandidate[]>;
}

export interface PayoutTransactionRunner extends PayoutTransactionReader {
  run<T>(work: (transaction: PayoutTransaction) => Promise<T>): Promise<T>;
}
