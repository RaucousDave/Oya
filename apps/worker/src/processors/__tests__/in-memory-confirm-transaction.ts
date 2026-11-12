import type { PaymentStatus } from "@oya/contracts";
import type {
  ConfirmableChainTx,
  ConfirmPayment,
  ConfirmTransaction,
  ConfirmTransactionRunner,
  LedgerEntry,
} from "../confirm-transaction.js";
import type { AuditEvent } from "../transfer-transaction.js";

export class InMemoryConfirmTransaction
  implements ConfirmTransactionRunner, ConfirmTransaction
{
  readonly payments = new Map<string, ConfirmPayment>();
  readonly chainTxs: ConfirmableChainTx[] = [];
  readonly ledgerEntries: LedgerEntry[] = [];
  readonly auditEvents: AuditEvent[] = [];

  constructor(
    payments: ConfirmPayment[] = [],
    chainTxs: ConfirmableChainTx[] = [],
  ) {
    for (const payment of payments) {
      this.payments.set(payment.id, { ...payment });
    }

    for (const chainTx of chainTxs) {
      this.chainTxs.push({ ...chainTx });
    }
  }

  async run<T>(
    work: (transaction: ConfirmTransaction) => Promise<T>,
  ): Promise<T> {
    const paymentSnapshot = [...this.payments].map(([id, payment]) => [
      id,
      { ...payment },
    ] as const);
    const chainTxSnapshot = this.chainTxs.map((chainTx) => ({ ...chainTx }));
    const ledgerSnapshot = [...this.ledgerEntries];
    const auditSnapshot = [...this.auditEvents];

    try {
      return await work(this);
    } catch (error) {
      this.payments.clear();
      for (const [id, payment] of paymentSnapshot) {
        this.payments.set(id, payment);
      }
      this.chainTxs.length = 0;
      this.chainTxs.push(...chainTxSnapshot);
      this.ledgerEntries.length = 0;
      this.ledgerEntries.push(...ledgerSnapshot);
      this.auditEvents.length = 0;
      this.auditEvents.push(...auditSnapshot);
      throw error;
    }
  }

  async findChainTxsBelowConfirmations(
    requiredConfirmations: number,
  ): Promise<ConfirmableChainTx[]> {
    return this.chainTxs.filter(
      (chainTx) => chainTx.confirmations < requiredConfirmations,
    );
  }

  async updateChainTxConfirmations(
    txHash: string,
    confirmations: number,
  ): Promise<void> {
    const expected = txHash.toLowerCase();
    const chainTx = this.chainTxs.find(
      (existing) => existing.txHash.toLowerCase() === expected,
    );

    if (chainTx === undefined) {
      throw new Error(`Chain transaction not found: ${txHash}`);
    }

    chainTx.confirmations = confirmations;
  }

  async findPayment(paymentId: string): Promise<ConfirmPayment | null> {
    return this.payments.get(paymentId) ?? null;
  }

  async sumConfirmedAmount(
    paymentId: string,
    requiredConfirmations: number,
  ): Promise<bigint> {
    return this.chainTxs
      .filter(
        (chainTx) =>
          chainTx.paymentId === paymentId &&
          chainTx.confirmations >= requiredConfirmations,
      )
      .reduce((total, chainTx) => total + chainTx.amount, 0n);
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

  async insertLedgerEntry(entry: LedgerEntry): Promise<void> {
    this.ledgerEntries.push({ ...entry });
  }

  async insertAuditEvent(event: AuditEvent): Promise<void> {
    this.auditEvents.push({ ...event });
  }
}
