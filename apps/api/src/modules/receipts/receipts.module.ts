import { MerchantProfilesService } from "../auth/merchant-profiles.service";
import { Controller, Get, Inject, Module, Param } from "@nestjs/common";
import { AllowAnonymous, Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { PaymentRepository, ReceiptRepository } from "@oya/database";
import type { PaymentReceipt } from "@oya/contracts";
import type { auth } from "../../lib/auth";
import { paymentIdSchema } from "@oya/contracts/validation";
import { validate } from "../../common/validation";
import { MerchantAuthModule } from "../auth/merchant-auth.module";
import { DatabaseModule } from "../database/database.module";

@Controller()
class ReceiptsController {
  constructor(
    @Inject(ReceiptRepository) private readonly receipts: ReceiptRepository,
    @Inject(MerchantProfilesService) private readonly merchants: MerchantProfilesService,
    @Inject(PaymentRepository) private readonly payments: PaymentRepository,
  ) {}

  @AllowAnonymous()
  @Get("payments/:paymentId/receipt")
  checkoutReceipt(@Param("paymentId") id: string) {
    return this.present(validate(paymentIdSchema, id));
  }

  @Get("merchant/payments/:paymentId/receipt")
  async merchantReceipt(@Session() session: UserSession<typeof auth>, @Param("paymentId") id: string) {
    const paymentId = validate(paymentIdSchema, id);
    const merchant = await this.merchants.resolve(session.user);
    await this.payments.getMerchantPayment({ paymentId, merchantId: merchant.id });
    return this.present(paymentId);
  }

  private async present(id: string): Promise<PaymentReceipt> {
    const row = await this.receipts.getCheckoutReceipt(id);
    return {
      ...row, ngnAmountKobo: row.ngnAmountKobo?.toString() ?? null,
      createdAt: row.createdAt?.toISOString() ?? null,
      transactionHashes: Array.isArray(row.transactionHashes) ? row.transactionHashes.filter(
        (hash): hash is string => typeof hash === "string" && /^0x[a-fA-F0-9]{64}$/.test(hash),
      ) : [],
    };
  }
}

@Module({ imports: [MerchantAuthModule, DatabaseModule], controllers: [ReceiptsController] })
export class ReceiptsModule {}
