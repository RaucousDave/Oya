import type { PaymentStatus } from "@oya/contracts";
import type {
  ExpirePayment,
  ExpireTransaction,
  ExpireTransactionRunner,
} from "../expire-transaction.js";
import type { AuditEvent } from "../transfer-transaction.js";

export class InMemoryExpireTransaction
  implements ExpireTransactionRunner, ExpireTransaction
{
  readonly payments = new Map<string, ExpirePayment>();
  readonly auditEvents: AuditEvent[] = [];
  afterCandidatesRead: (() => void) | undefined = undefined;

  constructor(payments: ExpirePayment[] = []) {
    for (const payment of payments) {
      this.payments.set(payment.id, { ...payment });
    }
  }

  async run<T>(
    work: (transaction: ExpireTransaction) => Promise<T>,
  ): Promise<T> {
    const paymentSnapshot = [...this.payments].map(([id, payment]) => [
      id,
      { ...payment },
    ] as const);
    const auditSnapshot = [...this.auditEvents];

    try {
      return await work(this);
    } catch (error) {
      this.payments.clear();
      for (const [id, payment] of paymentSnapshot) {
        this.payments.set(id, payment);
      }
      this.auditEvents.length = 0;
      this.auditEvents.push(...auditSnapshot);
      throw error;
    }
  }

  async findPaymentsByStatuses(
    statuses: readonly PaymentStatus[],
  ): Promise<ExpirePayment[]> {
    const candidates = [...this.payments.values()]
      .filter((payment) => statuses.includes(payment.status))
      .map((payment) => ({ ...payment }));

    this.afterCandidatesRead?.();

    return candidates;
  }

  async findPayment(paymentId: string): Promise<ExpirePayment | null> {
    const payment = this.payments.get(paymentId);

    return payment === undefined ? null : { ...payment };
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

  async insertAuditEvent(event: AuditEvent): Promise<void> {
    this.auditEvents.push({ ...event });
  }
}
