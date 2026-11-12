import type { Hex } from "@oya/chain";
import type { PaymentStatus } from "@oya/contracts";
import type { AuditEvent } from "./transfer-transaction.js";

export interface ConfirmableChainTx {
  txHash: Hex;
  paymentId: string;
  blockNumber: bigint;
  amount: bigint;
  confirmations: number;
}

export interface ConfirmPayment {
  id: string;
  status: PaymentStatus;
  requiredAmount: bigint;
}

export const ledgerEntryTypes = ["OVERPAYMENT_SURPLUS"] as const;
export type LedgerEntryType = (typeof ledgerEntryTypes)[number];

export interface LedgerEntry {
  paymentId: string;
  entryType: LedgerEntryType;
  amount: bigint;
  createdAt: Date;
}

export interface ConfirmTransaction {
  findChainTxsBelowConfirmations(
    requiredConfirmations: number,
  ): Promise<ConfirmableChainTx[]>;
  updateChainTxConfirmations(
    txHash: Hex,
    confirmations: number,
  ): Promise<void>;
  findPayment(paymentId: string): Promise<ConfirmPayment | null>;
  sumConfirmedAmount(
    paymentId: string,
    requiredConfirmations: number,
  ): Promise<bigint>;
  updatePaymentStatus(
    paymentId: string,
    status: PaymentStatus,
  ): Promise<void>;
  insertLedgerEntry(entry: LedgerEntry): Promise<void>;
  insertAuditEvent(event: AuditEvent): Promise<void>;
}

export interface ConfirmTransactionReader {
  findChainTxsBelowConfirmations(
    requiredConfirmations: number,
  ): Promise<ConfirmableChainTx[]>;
}

export interface ConfirmTransactionRunner extends ConfirmTransactionReader {
  run<T>(work: (transaction: ConfirmTransaction) => Promise<T>): Promise<T>;
}
