import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { RepositoryErrorFilter } from "./common/repository-error.filter";
import { MerchantAuthModule } from "./modules/auth/merchant-auth.module";
import { MerchantPaymentsModule } from "./modules/merchants/merchant-payments.module";
import { PaymentsModule } from "./modules/payments/payments.module";
import { ReceiptsModule } from "./modules/receipts/receipts.module";

@Module({
  imports: [MerchantAuthModule, PaymentsModule, MerchantPaymentsModule, ReceiptsModule],
  providers: [{ provide: APP_FILTER, useClass: RepositoryErrorFilter }],
})
export class AppModule { }
