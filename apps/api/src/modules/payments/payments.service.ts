import {
  ConflictException,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from "@nestjs/common";
import { deriveDepositAddress } from "@oya/chain";
import type {
  CheckoutPayment,
  CreatePaymentRequest,
  PaymentSummary,
} from "@oya/contracts";
import {
  AuditEventRepository,
  type CheckoutPaymentView,
  type Database,
  PaymentRepository,
  type Payments,
} from "@oya/database";
import {
  calculateRequiredTokenAmount,
  getExpiryTimeStamps,
  nairaToKobo,
  transitionPayment,
} from "@oya/domain";
import { z } from "zod";
import { RATE_PROVIDER, type RateProvider } from "./rate.provider";
import { DATABASE } from "../database/database.module";

const paymentSettings = z.object({
  DEPOSIT_XPUB: z.string().startsWith("xpub"),
  DEMO_TOKEN_ADDRESS: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .refine((value) => !/^0x0{40}$/.test(value)),
  DEMO_TOKEN_DECIMALS: z.coerce.number().int().min(0).max(77).default(6),
});
export const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:5173";
const chainId = 84532;

export function paymentSummary(
  payment: Pick<Payments, keyof PaymentSummary>,
): PaymentSummary {
  return {
    id: payment.id,
    reference: payment.reference,
    description: payment.description,
    ngnAmountKobo: payment.ngnAmountKobo.toString(),
    status: payment.status,
    createdAt: payment.createdAt.toISOString(),
  };
}

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(PaymentRepository) private readonly payments: PaymentRepository,
    @Inject(RATE_PROVIDER) private readonly rates: RateProvider,
  ) {}

  async create(
    merchantId: string,
    idempotencyKey: string,
    input: CreatePaymentRequest,
  ) {
    const ngnAmountKobo = nairaToKobo(input.amount);
    const description = input.description ?? null;
    const lookup = { merchantId, idempotencyKey };

    return this.db.transaction(async (tx) => {
      const repo = PaymentRepository.forTransaction(tx);
      const audit = new AuditEventRepository(tx);
      const replay = async (existing: Payments) => {
        if (
          existing.ngnAmountKobo !== ngnAmountKobo ||
          existing.description !== description
        ) {
          throw new ConflictException(
            "This idempotency key belongs to a different request",
          );
        }
        const metadata = (await audit.getCreationMetadata(existing.id)) as
          | { checkout?: CheckoutPayment }
          | undefined;
        return (
          metadata?.checkout ??
          this.present({
            ...(await repo.getCheckoutPayment({ paymentId: existing.id })),
            receivedTokenAmount: "0",
            status: "AWAITING_PAYMENT",
            receiptAvailable: false,
          })
        );
      };

      const existing = await repo.findByIdempotencyKey(lookup);
      if (existing) return replay(existing);

      const settings = paymentSettings.parse(process.env);
      const rate = await this.rates.getNgnUsdRate();
      const required = calculateRequiredTokenAmount(
        ngnAmountKobo,
        rate,
        settings.DEMO_TOKEN_DECIMALS,
      );
      if (required >= 2n ** 256n) {
        throw new UnprocessableEntityException(
          "Amount exceeds the token transfer limit",
        );
      }
      const createdAt = new Date();
      const { rateExpiresAt, gracePeriodExpiresAt } =
        getExpiryTimeStamps(createdAt);
      const transition = transitionPayment(
        "CREATED",
        "AWAITING_PAYMENT",
        "Payment request created",
      );
      const index = await repo.allocateDepositIndex();
      const payment = await repo.insertPaymentOnce({
        ...lookup,
        ngnAmountKobo,
        description,
        createdAt,
        chainId,
        reference: crypto.randomUUID(),
        tokenAddress: settings.DEMO_TOKEN_ADDRESS,
        tokenDecimals: settings.DEMO_TOKEN_DECIMALS,
        lockedRateNumeric: rate,
        requiredTokenAmount: required.toString(),
        depositAddress: deriveDepositAddress(settings.DEPOSIT_XPUB, index),
        rateExpiresAt,
        topUpExpiresAt: gracePeriodExpiresAt,
      });
      if (!payment) {
        const winner = await repo.findByIdempotencyKey(lookup);
        if (!winner)
          throw new ConflictException("Payment creation changed concurrently");
        return replay(winner);
      }
      const checkout = this.present(
        await repo.getCheckoutPayment({ paymentId: payment.id }),
      );
      await audit.append({
        paymentId: payment.id,
        oldStatus: transition.from,
        newStatus: transition.to,
        reason: transition.reason,
        createdAt,
        metadata: { checkout, depositIndex: index },
      });
      return checkout;
    });
  }

  async checkout(paymentId: string) {
    return this.present(await this.payments.getCheckoutPayment({ paymentId }));
  }

  private present(payment: CheckoutPaymentView): CheckoutPayment {
    const difference =
      BigInt(payment.requiredTokenAmount) - BigInt(payment.receivedTokenAmount);
    const remainingTokenAmount = (difference > 0n ? difference : 0n).toString();
    return {
      ...paymentSummary(payment),
      merchant: payment.merchant,
      requiredTokenAmount: payment.requiredTokenAmount,
      receivedTokenAmount: payment.receivedTokenAmount,
      remainingTokenAmount,
      token: {
        ...payment.token,
        symbol: process.env.DEMO_TOKEN_SYMBOL ?? "Test stablecoin",
      },
      chainId: payment.chainId,
      lockedRate: payment.lockedRate,
      rateExpiresAt: payment.rateExpiresAt.toISOString(),
      topUpExpiresAt: payment.topUpExpiresAt.toISOString(),
      depositAddress: payment.depositAddress,
      paymentUrl: new URL(`/pay/${encodeURIComponent(payment.id)}`, webOrigin)
        .href,
      qrPayload: `ethereum:${payment.token.address}@${payment.chainId}/transfer?address=${payment.depositAddress}&uint256=${remainingTokenAmount}`,
      requiredConfirmations: 2,
      receiptAvailable: payment.receiptAvailable,
    };
  }
}
