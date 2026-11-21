import { Inject, Injectable } from "@nestjs/common";
import type {
  ChainTransaction, CursorPage, MerchantPayment, MerchantPayments, PaymentAuditEvent, PaymentLedgerEntry,
} from "@oya/contracts";
import {
  AuditEventRepository, LedgerEntriesRepository, PaymentRepository, PayoutRepository,
  type ListMerchantPaymentsInput, type OwnedPaymentInput, type PaymentPageInput,
} from "@oya/database";
import { encodeCursor } from "../../common/validation";
import { paymentSummary, PaymentsService } from "../payments/payments.service";

function lagosPeriodStarts(now: Date) {
  const offset = 3_600_000;
  const civilDate = new Date(now.getTime() + offset);
  const midnight = Date.UTC(civilDate.getUTCFullYear(), civilDate.getUTCMonth(), civilDate.getUTCDate()) - offset;
  const daysAfterMonday = (civilDate.getUTCDay() + 6) % 7;
  return { today: new Date(midnight), week: new Date(midnight - daysAfterMonday * 86_400_000) };
}

@Injectable()
export class MerchantPaymentsService {
  constructor(
    @Inject(PaymentRepository) private readonly payments: PaymentRepository,
    @Inject(PaymentsService) private readonly checkout: PaymentsService,
    @Inject(AuditEventRepository) private readonly audit: AuditEventRepository,
    @Inject(LedgerEntriesRepository) private readonly ledger: LedgerEntriesRepository,
    @Inject(PayoutRepository) private readonly payouts: PayoutRepository,
  ) {}

  async list(input: ListMerchantPaymentsInput): Promise<MerchantPayments> {
    const [page, totals] = await Promise.all([
      this.payments.listMerchantPayments(input),
      this.payments.getMerchantTotals({ ...input, ...lagosPeriodStarts(new Date()) }),
    ]);
    return { items: page.items.map(paymentSummary), totals, nextCursor: encodeCursor(page.nextCursor) };
  }

  async detail(input: OwnedPaymentInput): Promise<MerchantPayment> {
    await this.payments.getMerchantPayment(input);
    const [payment, transactions, audit, ledger, payout] = await Promise.all([
      this.checkout.checkout(input.paymentId),
      this.transactions(input),
      this.auditEvents(input),
      this.ledgerEntries(input),
      this.payouts.findForPayment(input.paymentId),
    ]);
    return {
      payment, transactions, audit, ledger,
      payout: payout && {
        status: payout.status, ngnAmountKobo: payout.ngnAmountKobo?.toString() ?? null,
        provider: payout.provider, providerReference: payout.providerReference,
      },
    };
  }

  async transactions(input: OwnedPaymentInput & PaymentPageInput): Promise<CursorPage<ChainTransaction>> {
    const { items, nextCursor } = await this.payments.listTransactions(input);
    return {
      items: items.map((row) => ({
        id: row.id, txHash: row.txHash, amount: row.amount, blockNumber: row.blockNumber?.toString() ?? null,
        confirmations: row.confirmations, detectedAt: row.detectedAt.toISOString(),
        confirmedAt: row.confirmedAt?.toISOString() ?? null,
      })),
      nextCursor: encodeCursor(nextCursor),
    };
  }

  async auditEvents(input: OwnedPaymentInput & PaymentPageInput): Promise<CursorPage<PaymentAuditEvent>> {
    const cursor = input.cursor && { createdAt: input.cursor.timestamp, id: input.cursor.id };
    const page = await this.audit.getAuditEvents(input.paymentId, input.merchantId, input.limit, cursor);
    return {
      items: page.items.map(({ id, oldStatus, newStatus, reason, createdAt }) => ({
        id, oldStatus, newStatus, reason, createdAt: createdAt?.toISOString() ?? null,
      })),
      nextCursor: page.nextCursor && encodeCursor({ id: page.nextCursor.id, timestamp: page.nextCursor.createdAt }),
    };
  }

  async ledgerEntries(input: OwnedPaymentInput & PaymentPageInput): Promise<CursorPage<PaymentLedgerEntry>> {
    const cursor = input.cursor && { createdAt: input.cursor.timestamp, id: input.cursor.id };
    const page = await this.ledger.listLedgerEntries(input.paymentId, input.merchantId, input.limit, cursor);
    return {
      items: page.items.map(({ id, entryType, amount, assetCode, assetDecimals, createdAt }) => ({
        id, entryType, amount, assetCode, assetDecimals, createdAt: createdAt?.toISOString() ?? null,
      })),
      nextCursor: page.nextCursor && encodeCursor({ id: page.nextCursor.id, timestamp: page.nextCursor.createdAt }),
    };
  }
}
