import { Module } from "@nestjs/common";
import {
  AuditEventRepository, db, LedgerEntriesRepository, MerchantRepository,
  PaymentRepository, PayoutRepository, ReceiptRepository,
} from "@oya/database";

export const DATABASE = Symbol("DATABASE");
const repositories = [
  PaymentRepository, MerchantRepository, AuditEventRepository,
  LedgerEntriesRepository, PayoutRepository, ReceiptRepository,
];

@Module({
  providers: [
    { provide: DATABASE, useValue: db },
    ...repositories.map((repository) => ({
      provide: repository,
      useFactory: () => new repository(db),
    })),
  ],
  exports: [DATABASE, ...repositories],
})
export class DatabaseModule {}
