import type {
  AuditEvent,
  ChainTxRecord,
  Payment,
  PaymentUpdate,
  TransferTransaction,
  TransferTransactionRunner,
} from "../transfer-transaction.js";

export class InMemoryTransferTransaction
  implements TransferTransactionRunner, TransferTransaction
{
  readonly payments = new Map<string, Payment>();
  readonly chainTxs: ChainTxRecord[] = [];
  readonly auditEvents: AuditEvent[] = [];

  constructor(payments: Payment[] = []) {
    for (const payment of payments) {
      this.payments.set(payment.id, { ...payment });
    }
  }

  async run<T>(work: (transaction: TransferTransaction) => Promise<T>): Promise<T> {
    const paymentSnapshot = [...this.payments].map(([id, payment]) => [
      id,
      { ...payment },
    ] as const);
    const chainTxSnapshot = [...this.chainTxs];
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
      this.auditEvents.length = 0;
      this.auditEvents.push(...auditSnapshot);
      throw error;
    }
  }

  async findPaymentByDepositAddress(
    depositAddress: string,
  ): Promise<Payment | null> {
    const expected = depositAddress.toLowerCase();

    for (const payment of this.payments.values()) {
      if (payment.depositAddress.toLowerCase() === expected) {
        return payment;
      }
    }

    return null;
  }

  async insertChainTxIfAbsent(chainTx: ChainTxRecord): Promise<boolean> {
    const expected = chainTx.txHash.toLowerCase();
    const exists = this.chainTxs.some(
      (existing) => existing.txHash.toLowerCase() === expected,
    );

    if (exists) {
      return false;
    }

    this.chainTxs.push({ ...chainTx });
    return true;
  }

  async updatePayment(
    paymentId: string,
    update: PaymentUpdate,
  ): Promise<void> {
    const payment = this.payments.get(paymentId);

    if (payment === undefined) {
      throw new Error(`Payment not found: ${paymentId}`);
    }

    this.payments.set(paymentId, { ...payment, ...update });
  }

  async insertAuditEvent(event: AuditEvent): Promise<void> {
    this.auditEvents.push({ ...event });
  }
}
