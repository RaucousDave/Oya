import type { PaymentStatus } from "@oya/contracts";
import type { AuditEvent } from "./transfer-transaction.js";

export interface ExpirePayment {
  id: string;
  status: PaymentStatus;
  createdAt: Date;
}

export interface ExpireTransaction {
  findPayment(paymentId: string): Promise<ExpirePayment | null>;
  updatePaymentStatus(paymentId: string, status: PaymentStatus): Promise<void>;
  insertAuditEvent(event: AuditEvent): Promise<void>;
}

export interface ExpireTransactionReader {
  findPaymentsByStatuses(
    statuses: readonly PaymentStatus[],
  ): Promise<ExpirePayment[]>;
}

export interface ExpireTransactionRunner extends ExpireTransactionReader {
  run<T>(work: (transaction: ExpireTransaction) => Promise<T>): Promise<T>;
}
