import type { PaymentStatus } from "@oya/contracts";
import type {
  PayoutCandidate,
  PayoutLedgerEntry,
  PayoutPayment,
  PayoutRecord,
  PayoutTransaction,
  PayoutTransactionRunner,
  ReceiptSnapshot,
} from "../payout-transaction.js";
import type { AuditEvent } from "../transfer-transaction.js";

export type PayoutInsertMethod =
  | "insertPayout"
  | "insertLedgerEntry"
  | "insertReceipt";

function clonePayment(payment: PayoutPayment): PayoutPayment {
  return { ...payment, txHashes: [...payment.txHashes] };
}

function cloneReceipt(receipt: ReceiptSnapshot): ReceiptSnapshot {
  return { ...receipt, txHashes: [...receipt.txHashes] };
}

export class InMemoryPayoutTransaction
  implements PayoutTransactionRunner, PayoutTransaction
{
  readonly payments = new Map<string, PayoutPayment>();
  readonly payouts = new Map<string, PayoutRecord>();
  readonly ledgerEntries = new Map<string, PayoutLedgerEntry>();
  readonly receipts = new Map<string, ReceiptSnapshot>();
  readonly auditEvents: AuditEvent[] = [];
  afterCandidatesRead: (() => void) | undefined = undefined;
  failNextInsertOf: PayoutInsertMethod | undefined = undefined;

  constructor(payments: PayoutPayment[] = []) {
    for (const payment of payments) {
      this.payments.set(payment.id, clonePayment(payment));
    }
  }

  async run<T>(
    work: (transaction: PayoutTransaction) => Promise<T>,
  ): Promise<T> {
    const paymentsSnapshot = [...this.payments].map(
      ([id, payment]) => [id, clonePayment(payment)] as const,
    );
    const payoutsSnapshot = [...this.payouts].map(
      ([id, payout]) => [id, { ...payout }] as const,
    );
    const ledgerSnapshot = [...this.ledgerEntries].map(
      ([key, entry]) => [key, { ...entry }] as const,
    );
    const receiptsSnapshot = [...this.receipts].map(
      ([id, receipt]) => [id, cloneReceipt(receipt)] as const,
    );
    const auditSnapshot = this.auditEvents.map((event) => ({ ...event }));

    try {
      return await work(this);
    } catch (error) {
      this.payments.clear();
      for (const [id, payment] of paymentsSnapshot) {
        this.payments.set(id, payment);
      }
      this.payouts.clear();
      for (const [id, payout] of payoutsSnapshot) {
        this.payouts.set(id, payout);
      }
      this.ledgerEntries.clear();
      for (const [key, entry] of ledgerSnapshot) {
        this.ledgerEntries.set(key, entry);
      }
      this.receipts.clear();
      for (const [id, receipt] of receiptsSnapshot) {
        this.receipts.set(id, receipt);
      }
      this.auditEvents.length = 0;
      this.auditEvents.push(...auditSnapshot);
      throw error;
    }
  }

  async findPaymentsByStatuses(
    statuses: readonly PaymentStatus[],
  ): Promise<PayoutCandidate[]> {
    const candidates = [...this.payments.values()]
      .filter((payment) => statuses.includes(payment.status))
      .map((payment) => ({ id: payment.id, status: payment.status }));

    this.afterCandidatesRead?.();

    return candidates;
  }

  async findPayment(paymentId: string): Promise<PayoutPayment | null> {
    const payment = this.payments.get(paymentId);

    return payment === undefined ? null : clonePayment(payment);
  }

  async updatePaymentStatus(
    paymentId: string,
    status: PaymentStatus,
  ): Promise<void> {
    const payment = this.payments.get(paymentId);

    if (payment === undefined) {
      throw new Error(`Payment not found: ${paymentId}`);
    }

    this.payments.set(paymentId, { ...payment, status });
  }

  async insertPayout(payout: PayoutRecord): Promise<void> {
    if (this.payouts.has(payout.paymentId)) {
      return;
    }

    this.throwIfFailing("insertPayout");
    this.payouts.set(payout.paymentId, { ...payout });
  }

  async insertLedgerEntry(entry: PayoutLedgerEntry): Promise<void> {
    const key = ledgerKey(entry);

    if (this.ledgerEntries.has(key)) {
      return;
    }

    this.throwIfFailing("insertLedgerEntry");
    this.ledgerEntries.set(key, { ...entry });
  }

  async insertReceipt(receipt: ReceiptSnapshot): Promise<void> {
    if (this.receipts.has(receipt.paymentId)) {
      return;
    }

    this.throwIfFailing("insertReceipt");
    this.receipts.set(receipt.paymentId, cloneReceipt(receipt));
  }

  async insertAuditEvent(event: AuditEvent): Promise<void> {
    this.auditEvents.push({ ...event });
  }

  private throwIfFailing(method: PayoutInsertMethod): void {
    if (this.failNextInsertOf !== method) {
      return;
    }

    this.failNextInsertOf = undefined;
    throw new Error(`${method} failed`);
  }
}

function ledgerKey(entry: PayoutLedgerEntry): string {
  return `${entry.paymentId}:${entry.entryType}`;
}
