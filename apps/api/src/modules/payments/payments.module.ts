import { Module } from "@nestjs/common";
import { MerchantAuthModule } from "../auth/merchant-auth.module";
import { DatabaseModule } from "../database/database.module";
import { PaymentsController } from "./payments.controller";
import { FixedRateProvider, RATE_PROVIDER } from "./rate.provider";
import { PaymentsService } from "./payments.service";

@Module({
  imports: [MerchantAuthModule, DatabaseModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, { provide: RATE_PROVIDER, useClass: FixedRateProvider }],
  exports: [PaymentsService],
})
export class PaymentsModule {}
