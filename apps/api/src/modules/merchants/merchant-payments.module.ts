import { Module } from "@nestjs/common";
import { MerchantAuthModule } from "../auth/merchant-auth.module";
import { DatabaseModule } from "../database/database.module";
import { PaymentsModule } from "../payments/payments.module";
import { MerchantPaymentsController } from "./merchant-payments.controller";
import { MerchantPaymentsService } from "./merchant-payments.service";

@Module({
  imports: [MerchantAuthModule, DatabaseModule, PaymentsModule],
  controllers: [MerchantPaymentsController],
  providers: [MerchantPaymentsService],
})
export class MerchantPaymentsModule {}
