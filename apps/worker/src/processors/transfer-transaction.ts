import type { Hex } from "@oya/chain";
import type { PaymentStatus } from "@oya/contracts";

export interface Payment {
  id: string;
  depositAddress: Hex;
  status: PaymentStatus;
  receivedAmount: bigint;
}

export interface ChainTxRecord {
  txHash: Hex;
  paymentId: string;
  blockNumber: bigint;
  to: Hex;
  amount: bigint;
}

export interface PaymentUpdate {
  receivedAmount: bigint;
  status: PaymentStatus;
}

export interface AuditEvent {
  paymentId: string;
  fromStatus: PaymentStatus;
  toStatus: PaymentStatus;
  reason: string;
  txHash: Hex | null;
  createdAt: Date;
}

export interface TransferTransaction {
  findPaymentByDepositAddress(depositAddress: Hex): Promise<Payment | null>;
  insertChainTxIfAbsent(chainTx: ChainTxRecord): Promise<boolean>;
  updatePayment(paymentId: string, update: PaymentUpdate): Promise<void>;
  insertAuditEvent(event: AuditEvent): Promise<void>;
}

export interface TransferTransactionRunner {
  run<T>(work: (transaction: TransferTransaction) => Promise<T>): Promise<T>;
}
